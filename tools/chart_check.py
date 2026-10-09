#!/usr/bin/env python3
"""Check chart files before they go into the atlas (see docs/CHARTING.md).

  tools/chart_check.py CHART.json [CHART.json ...]

Each chart is merged into a copy of the atlas and run through the atlas check (bin/orrery). Then
the house rules: one primary per sphere, ids, parents, orbits with periods, a source on every
body, and the writing rules (no em or en dashes, no semicolons, sentences of 25 words or fewer,
no filler words). Exit status 1 when any chart has an error.
"""
from __future__ import annotations

import copy
import importlib.machinery
import importlib.util
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_loader = importlib.machinery.SourceFileLoader("orrery", str(ROOT / "bin" / "orrery"))
_spec = importlib.util.spec_from_loader("orrery", _loader)
assert _spec
orrery = importlib.util.module_from_spec(_spec)
_loader.exec_module(orrery)

FILLER = re.compile(r"\b(should|may|might|would|very|really|just|basically|actually|quite|rather|perhaps|maybe|probably|etc|e\.g|i\.e)\b", re.I)
ID = re.compile(r"[a-z0-9]+(-[a-z0-9]+)*")


def prose(where: str, text: str, errs: list[str], warns: list[str]) -> None:
    if not text:
        return
    if "—" in text or "–" in text:
        errs.append(f"{where}: no em or en dashes")
    if ";" in text:
        errs.append(f"{where}: no semicolons")
    for sent in re.split(r"(?<=[.!?])\s+", text):
        if len(sent.split()) > 25:
            errs.append(f"{where}: a sentence of {len(sent.split())} words (25 at most): {sent[:70]}")
    m = FILLER.search(text)
    if m:
        warns.append(f"{where}: avoid '{m.group(0)}'")


def check(path: Path, atlas: dict) -> tuple[list[str], list[str]]:
    chart = json.loads(path.read_text())
    errs: list[str] = []
    warns: list[str] = []
    sid = chart.get("sphere_id")
    d = copy.deepcopy(atlas)
    s = next((x for x in d["spheres"] if x["id"] == sid), None)
    if s is None:
        return [f"no sphere with id {sid!r} in the atlas"], []
    s.update(chart.get("sphere") or {})
    bodies = chart.get("bodies") or []
    s["bodies"] = bodies
    errs += orrery.validate(d)
    if bodies and len([b for b in bodies if not b.get("parent")]) != 1:
        errs.append("exactly one body needs parent null (the primary)")
    sp = chart.get("sphere") or {}
    prose("sphere summary", sp.get("summary", ""), errs, warns)
    for f in sp.get("facts", []):
        prose(f"sphere fact {f[0]}", str(f[1]), errs, warns)
    ids = {b.get("id") for b in bodies}
    for b in bodies:
        w = b.get("id", "?")
        if not ID.fullmatch(w):
            errs.append(f"{w}: an id is lowercase words joined by hyphens")
        if not b.get("sources"):
            errs.append(f"{w}: needs sources")
        if not b.get("wiki"):
            warns.append(f"{w}: no wiki link")
        if b.get("kind") != "ring" and not b.get("summary"):
            errs.append(f"{w}: needs a summary")
        prose(f"{w} summary", b.get("summary", ""), errs, warns)
        for f in b.get("facts", []):
            if not (isinstance(f, list) and len(f) == 2):
                errs.append(f"{w}: facts are [label, value] pairs")
            else:
                prose(f"{w} fact {f[0]}", str(f[1]), errs, warns)
        if b.get("orbit") and not b["orbit"].get("period_days"):
            errs.append(f"{w}: an orbit needs period_days (estimate it and set approx: true)")
        if b.get("parent") and b["parent"] not in ids:
            errs.append(f"{w}: parent {b['parent']} is not in this chart")
    return errs, warns


def main() -> int:
    atlas = json.loads((ROOT / "site" / "data" / "atlas.json").read_text())
    bad = 0
    for arg in sys.argv[1:]:
        errs, warns = check(Path(arg), atlas)
        for e in errs:
            print(f"{arg}: ERROR: {e}")
        for w in warns:
            print(f"{arg}: warning: {w}")
        print(f"{arg}: {len(errs)} errors, {len(warns)} warnings")
        bad += bool(errs)
    return 1 if bad else 0


if __name__ == "__main__":
    raise SystemExit(main())
