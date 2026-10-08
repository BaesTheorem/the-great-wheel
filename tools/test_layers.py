#!/usr/bin/env python3
"""Checks the split of the full atlas into the public atlas and the private overlay, and the join
back. Run: python3 tools/test_layers.py (or pytest tools/test_layers.py)."""
from __future__ import annotations

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

FULL = {
    "format": 1, "title": "Test",
    "between": {"bodies": [{"id": "ship", "name": "Ship", "kind": "ship", "map": {"pos": [0, 0, 0]}, "dm": "pirates"},
                           {"id": "hidden-ship", "name": "Hidden", "kind": "ship", "map": {"pos": [1, 0, 0]}, "secret": True}]},
    "regions": [{"id": "grp", "name": "Group"}, {"id": "cabal", "name": "Cabal", "secret": True}],
    "spheres": [
        {"id": "a", "name": "A", "map": {"pos": [0, 0, 0]}, "region": "grp", "dm": "sphere note", "dm_links": [{"label": "x", "url": "https://x"}],
         "bodies": [{"id": "sun", "name": "Sun", "kind": "star", "parent": None},
                    {"id": "w", "name": "W", "kind": "planet", "parent": "sun", "orbit": {"radius_mi": 1e8}, "dm": "body note"},
                    {"id": "base", "name": "Base", "kind": "structure", "parent": "sun", "orbit": {"radius_mi": 2e8}, "secret": True},
                    {"id": "moonbase", "name": "Moonbase", "kind": "moon", "parent": "base", "orbit": {"radius_mi": 1e4}}]},
        {"id": "b", "name": "B", "map": {"pos": [1, 0, 0]}, "region": "cabal", "bodies": []},
        {"id": "c", "name": "C", "map": {"pos": [2, 0, 0]}, "secret": True, "bodies": []},
    ],
    "flows": [{"id": "ab", "from": "a", "to": "b", "direction": "route", "dm": "flow note"},
              {"id": "ac", "from": "a", "to": "c", "direction": "two-way"}],
}


def test_public_has_nothing_private():
    public, overlay = orrery.split(FULL)
    text = json.dumps(public)
    for word in ("sphere note", "body note", "flow note", "pirates", "https://x", "Hidden", "Base", "Moonbase", "Cabal", '"c"'):
        assert word not in text, word
    assert orrery.validate(public) == []
    assert len(overlay["secret"]) == 6  # hidden ship, cabal, base, moonbase, sphere c, flow a-c


def test_round_trip():
    public, overlay = orrery.split(FULL)
    full = orrery.join(public, overlay)
    assert orrery.split(full) == (public, overlay)
    assert orrery.validate(full) == []
    a = next(s for s in full["spheres"] if s["id"] == "a")
    assert a["dm"] == "sphere note" and {b["id"] for b in a["bodies"]} == {"sun", "w", "base", "moonbase"}
    assert next(s for s in full["spheres"] if s["id"] == "b")["region"] == "cabal"


def test_github_edit_survives():
    public, overlay = orrery.split(FULL)
    public["spheres"][0]["summary"] = "Edited on GitHub"
    public["spheres"][0]["bodies"] = [b for b in public["spheres"][0]["bodies"] if b["id"] != "w"]  # deleted on GitHub
    full = orrery.join(public, overlay)
    a = next(s for s in full["spheres"] if s["id"] == "a")
    assert a["summary"] == "Edited on GitHub" and a["dm"] == "sphere note"
    assert "w" not in {b["id"] for b in a["bodies"]}


if __name__ == "__main__":
    for name, fn in list(globals().items()):
        if name.startswith("test_"):
            fn()
            print("ok ", name)
