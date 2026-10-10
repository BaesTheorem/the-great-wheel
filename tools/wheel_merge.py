#!/usr/bin/env python3
"""Check a chart of the planes and merge it into the Great Wheel (site/data/atlas.json, "wheel").

  tools/wheel_merge.py CHART.json            check only
  tools/wheel_merge.py CHART.json --write    check, then merge

A chart is {"planes": [...], "links": [...]}. Each item has the id of a plane or path that is
already on the wheel, and the fields to set: summary, facts ([label, value] pairs), layers
([{"name", "summary"}]), sources ([{"title", "pages"}]), aka, wiki, gate_town and by_edition. A field
in the chart replaces the one on the wheel; a by_edition entry merges one edition at a time.
The checks are the house rules of tools/chart_check.py: a source on every item, and sentences of
25 words or fewer with no em or en dashes and no semicolons.
"""
from __future__ import annotations

import importlib.machinery
import importlib.util
import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "tools"))
_loader = importlib.machinery.SourceFileLoader("orrery", str(ROOT / "bin" / "orrery"))
_spec = importlib.util.spec_from_loader("orrery", _loader)
assert _spec
orrery = importlib.util.module_from_spec(_spec)
_loader.exec_module(orrery)
from chart_check import prose  # chart_check sits next to this file

FIELDS = {"summary", "facts", "layers", "sources", "aka", "wiki", "gate_town", "by_edition", "name"}


def check_item(kind: str, item: dict, known: set[str], errs: list[str], warns: list[str]) -> None:
    w = f"{kind} {item.get('id', '?')}"
    if item.get("id") not in known:
        errs.append(f"{w}: no such {kind} on the wheel")
    extra = set(item) - FIELDS - {"id"}
    if extra:
        errs.append(f"{w}: unknown fields {sorted(extra)}")
    if not item.get("sources") and not item.get("by_edition"):
        errs.append(f"{w}: needs sources")
    for src in item.get("sources", []):
        if not (isinstance(src, dict) and src.get("title") and src.get("pages")):
            errs.append(f"{w}: a source is {{title, pages}}")
    prose(f"{w} summary", item.get("summary", ""), errs, warns)
    for f in item.get("facts", []):
        if not (isinstance(f, list) and len(f) == 2):
            errs.append(f"{w}: facts are [label, value] pairs")
        else:
            prose(f"{w} fact {f[0]}", str(f[1]), errs, warns)
    for layer in item.get("layers", []):
        if not layer.get("name"):
            errs.append(f"{w}: a layer needs a name")
        prose(f"{w} layer {layer.get('name')}", layer.get("summary", ""), errs, warns)
    for ed, over in (item.get("by_edition") or {}).items():
        if ed not in ("2e", "5e"):
            errs.append(f"{w}: edition {ed}?")
        prose(f"{w} {ed} summary", over.get("summary", ""), errs, warns)
        for f in over.get("facts", []):
            prose(f"{w} {ed} fact {f[0] if f else '?'}", str(f[1]) if len(f) > 1 else "", errs, warns)


def main() -> int:
    if len(sys.argv) < 2:
        print(__doc__)
        return 2
    chart = json.loads(Path(sys.argv[1]).read_text())
    write = "--write" in sys.argv[2:]
    d = orrery.load_full()
    wheel = d["wheel"]
    planes = {p["id"]: p for p in wheel["planes"]}
    links = {link["id"]: link for link in wheel["links"]}
    errs: list[str] = []
    warns: list[str] = []
    for item in chart.get("planes", []):
        check_item("plane", item, set(planes), errs, warns)
    for item in chart.get("links", []):
        check_item("path", item, set(links), errs, warns)
    for e in errs:
        print("ERROR:", e)
    for w in warns:
        print("warning:", w)
    print(f"{len(chart.get('planes', []))} planes, {len(chart.get('links', []))} paths: {len(errs)} errors, {len(warns)} warnings")
    if errs or not write:
        return 1 if errs else 0
    for kind, table in (("planes", planes), ("links", links)):
        for item in chart.get(kind, []):
            target = table[item["id"]]
            for k, v in item.items():
                if k == "id":
                    continue
                if k == "by_edition":
                    for ed, over in v.items():
                        target.setdefault("by_edition", {}).setdefault(ed, {}).update(over)
                else:
                    target[k] = v
    problems = orrery.validate(d)
    if problems:
        for p in problems:
            print("ERROR after merge:", p)
        return 1
    orrery.save_full(d)
    print("merged into the wheel")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
