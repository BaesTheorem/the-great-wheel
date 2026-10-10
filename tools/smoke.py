#!/usr/bin/env python3
"""Smoke test: start the editor server, open each view in headless Chromium, and fail on any page
error. With --shots DIR it also saves a screenshot of each view (useful after a visual change).
With --tour it also flies to every Realmspace body and saves a picture of each (needs --shots).

  tools/smoke.py [--shots DIR] [--tour]

Needs Playwright (pip install playwright && playwright install chromium).
"""
from __future__ import annotations

import argparse
import socket
import subprocess
import sys
import time
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent
VIEWS = [
    ("between-2e", "#/", 1440, 900, 1),
    ("between-5e", "#/?e=5e", 1440, 900, 1),
    ("sphere", "#/realmspace", 1440, 900, 1),
    ("world", "#/realmspace/toril", 1440, 900, 1),
    ("edit", "?edit#/realmspace/glyth", 1440, 900, 1),
    ("phone", "#/realmspace/toril", 390, 844, 2),
    ("black-hole", "#/dead-shell/black-hole", 1280, 800, 1),
    ("link-pin", "?embed&pin=toril:0.5:0.42:Test#/realmspace/toril", 1280, 800, 1),
    ("wheel", "#/wheel", 1440, 900, 1),
    ("wheel-5e", "#/wheel?e=5e", 1440, 900, 1),
    ("wheel-path", "#/wheel/link:yggdrasil", 1440, 900, 1),
    ("wheel-phone", "#/wheel/abyss", 390, 844, 2),
]


def free_port() -> int:
    with socket.socket() as s:
        s.bind(("127.0.0.1", 0))
        return s.getsockname()[1]


def tour(browser, port: int, shots: Path) -> int:
    """Fly to each body of Realmspace and save a picture, with the panel closed."""
    import json
    ids = [b["id"] for b in json.loads((ROOT / "site" / "data" / "atlas.json").read_text())["spheres"][0]["bodies"]]
    page = browser.new_page(viewport={"width": 1280, "height": 800})
    errors: list[str] = []
    page.on("pageerror", lambda e: errors.append(str(e)))
    page.goto(f"http://127.0.0.1:{port}/#/realmspace", wait_until="domcontentloaded")
    page.wait_for_function("window.orrery && window.orrery.state && !document.querySelector('#loading').classList.contains('on')", timeout=60000)
    page.evaluate("window.orrery.state.playing = false")
    time.sleep(6)
    out = shots / "tour"
    out.mkdir(parents=True, exist_ok=True)
    for bid in ids:
        page.evaluate(f"window.orrery.select({{type: 'body', id: {json.dumps(bid)}, sphere: 'realmspace'}}, {{instant: true}}); window.orrery.closePanel()")
        time.sleep(2.0)
        page.screenshot(path=str(out / f"{bid}.png"))
    print(f"{'FAIL' if errors else 'ok  '} tour of {len(ids)} bodies -> {out}" + "".join(f"\n     {e[:200]}" for e in errors[:5]))
    page.close()
    return int(bool(errors))


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--shots", type=Path)
    ap.add_argument("--tour", action="store_true")
    a = ap.parse_args()
    port = free_port()
    srv = subprocess.Popen([sys.executable, str(ROOT / "bin" / "orrery"), "serve", "--port", str(port)], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(1.0)
    failures = 0
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(args=["--use-angle=swiftshader", "--enable-unsafe-swiftshader", "--ignore-gpu-blocklist"])
            for name, path, w, h, dpr in VIEWS:
                page = browser.new_page(viewport={"width": w, "height": h}, device_scale_factor=dpr)
                errors: list[str] = []
                page.on("pageerror", lambda e, errs=errors: errs.append(str(e)))
                page.on("console", lambda m, errs=errors: errs.append(m.text) if m.type == "error" else None)
                page.goto(f"http://127.0.0.1:{port}/{path}", wait_until="domcontentloaded")
                try:
                    page.wait_for_function("window.orrery && window.orrery.state && !document.querySelector('#loading').classList.contains('on')", timeout=60000)
                except Exception as e:  # noqa: BLE001
                    errors.append(f"never became ready: {e}")
                if name == "edit":
                    page.click("#editbtn")
                    time.sleep(1.5)
                    page.evaluate("window.orrery.editSelected()")
                time.sleep(3)
                if a.shots:
                    a.shots.mkdir(parents=True, exist_ok=True)
                    page.screenshot(path=str(a.shots / f"{name}.png"))
                print(f"{'FAIL' if errors else 'ok  '} {name}" + "".join(f"\n     {e[:200]}" for e in errors[:5]))
                failures += bool(errors)
                page.close()
            if a.tour and a.shots:
                failures += tour(browser, port, a.shots)
            browser.close()
    finally:
        srv.terminate()
    return 1 if failures else 0


if __name__ == "__main__":
    sys.exit(main())
