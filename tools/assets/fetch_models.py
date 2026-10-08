#!/usr/bin/env python3
"""Download the source models for the orrery into sources/models/ (git ignores that folder).

Poly Haven models are CC0. The skull is "High quality skull" by Mariano Coretti on Wikimedia
Commons, CC BY-SA 4.0, so the web model made from it (site/assets/models/skull.glb) is also
CC BY-SA 4.0. tools/assets/build_models.py turns these sources into the small GLB files the map loads.
"""
from __future__ import annotations

import json
import sys
import urllib.request
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "sources" / "models"
UA = {"User-Agent": "WildspaceOrrery/1.0 (https://github.com/BaesTheorem)"}
POLYHAVEN = ["moon_rock_01", "moon_rock_03", "moon_rock_05", "moon_rock_06", "modular_fort_01", "island_tree_02",
             "dead_tree_trunk", "namaqualand_cliff_02"]
SKULL = "https://upload.wikimedia.org/wikipedia/commons/d/d8/High_quality_skull.stl"


def get(url: str) -> bytes:
    with urllib.request.urlopen(urllib.request.Request(url, headers=UA), timeout=120) as r:
        return r.read()


def save(url: str, dest: Path) -> None:
    if dest.exists() and dest.stat().st_size > 0:
        return
    dest.parent.mkdir(parents=True, exist_ok=True)
    dest.write_bytes(get(url))
    print(f"  {dest.relative_to(ROOT)} ({dest.stat().st_size / 1e6:.1f} MB)", flush=True)


def main() -> int:
    for pid in POLYHAVEN:
        files = json.loads(get(f"https://api.polyhaven.com/files/{pid}"))
        g = files["gltf"]["1k"]["gltf"]
        base = OUT / pid
        save(g["url"], base / Path(g["url"]).name)
        for rel, inc in g.get("include", {}).items():
            save(inc["url"], base / rel)
        print(f"{pid}: ok", flush=True)
    save(SKULL, OUT / "skull" / "High_quality_skull.stl")
    print("skull: ok")
    return 0


if __name__ == "__main__":
    sys.exit(main())
