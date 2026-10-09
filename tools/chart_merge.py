#!/usr/bin/env python3
"""Merge chart files into the atlas: one file per sphere, with its bodies and new sphere facts.

  tools/chart_merge.py CHART.json [CHART.json ...] [--dry-run]

A chart file (see docs/CHARTING.md) holds "sphere_id", "sphere" (the sphere fields to change) and
"bodies" (the sphere's full list of bodies, which replaces the old list). The sphere's id, name,
wiki link, editions, group and map place never change here. A chart with bodies marks the sphere
as charted. The private overlay is kept: the atlas is read and written through bin/orrery, so DM
notes on bodies that keep their ids stay attached.
"""
from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import json
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_loader = importlib.machinery.SourceFileLoader("orrery", str(ROOT / "bin" / "orrery"))
_spec = importlib.util.spec_from_loader("orrery", _loader)
assert _spec
orrery = importlib.util.module_from_spec(_spec)
_loader.exec_module(orrery)

KEEP = {"id", "name", "wiki", "editions", "region", "map", "charted", "bodies", "by_edition"}
SPHERE_FIELDS = {"summary", "facts", "sources", "shell_radius_mi", "aka", "stars", "boundary", "calendar", "links", "inner"}


def merge(d: dict, chart: dict) -> str:
    sid = chart["sphere_id"]
    s = next((x for x in d["spheres"] if x["id"] == sid), None)
    if s is None:
        raise SystemExit(f"{sid}: no such sphere in the atlas")
    for k, v in (chart.get("sphere") or {}).items():
        if k in KEEP or k not in SPHERE_FIELDS:
            continue
        s[k] = v
    bodies = chart.get("bodies") or []
    if bodies:
        for b in bodies:
            b.setdefault("editions", s.get("editions", ["2e", "5e"]))
        s["bodies"] = bodies
        s["charted"] = True
    return f"{sid}: {len(bodies)} bodies" if bodies else f"{sid}: sphere facts only"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("charts", nargs="+", type=Path)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    d = orrery.load_full()
    for path in a.charts:
        print(merge(d, json.loads(path.read_text())))
    errs = orrery.validate(d)
    if errs:
        print("\n".join(errs))
        return 1
    if not a.dry_run:
        orrery.save_full(d)
        print("saved the atlas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
