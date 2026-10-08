#!/usr/bin/env python3
"""Lay the crystal spheres out in 3D on the phlogiston map.

  tools/layout.py [--new] [--seed N] [--dry-run]

A force layout: spheres push each other apart, known currents pull their two spheres together,
the members of a group (map "regions") pull toward each other and push other spheres out of the
group, and spheres with no known current settle on an outer shell. The result fills 3D space, so
the map has depth when it turns. The books give no positions in the phlogiston, so the layout only
follows the currents and the groups.

Spheres with "map": {"pinned": true} keep their positions (the core triangle of Realmspace,
Greyspace and Krynnspace is pinned). With --new, only spheres still at [0, 0, 0] (new spheres) move.
The private overlay is kept: the atlas is read and written through bin/orrery.
"""
from __future__ import annotations

import argparse
import importlib.machinery
import importlib.util
import math
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
_loader = importlib.machinery.SourceFileLoader("orrery", str(ROOT / "bin" / "orrery"))
_spec = importlib.util.spec_from_loader("orrery", _loader)
assert _spec
orrery = importlib.util.module_from_spec(_spec)
_loader.exec_module(orrery)

Vec = list[float]


def sub(a: Vec, b: Vec) -> Vec:
    return [a[0] - b[0], a[1] - b[1], a[2] - b[2]]


def norm(a: Vec) -> float:
    return math.sqrt(a[0] * a[0] + a[1] * a[1] + a[2] * a[2])


def random_unit(r: random.Random) -> Vec:
    z = r.uniform(-1, 1)
    t = r.uniform(0, 2 * math.pi)
    s = math.sqrt(1 - z * z)
    return [s * math.cos(t), s * math.sin(t), z]


def layout(d: dict, seed: int, only_new: bool, steps: int = 3000) -> dict:
    spheres = d["spheres"]
    ids = [s["id"] for s in spheres]
    size = {s["id"]: float(s.get("map", {}).get("size", 1)) for s in spheres}
    region = {s["id"]: s.get("region") for s in spheres}
    pos = {s["id"]: [float(v) for v in s.get("map", {}).get("pos", [0, 0, 0])] for s in spheres}
    is_new = {i: all(abs(v) < 1e-9 for v in pos[i]) for i in ids}
    fixed = {s["id"] for s in spheres if s.get("map", {}).get("pinned")}
    if only_new:
        fixed |= {i for i in ids if not is_new[i]}
    edges = [(f["from"], f["to"]) for f in d.get("flows", []) if f.get("from") in pos and f.get("to") in pos]
    neighbors: dict[str, set[str]] = {i: set() for i in ids}
    for a, b in edges:
        neighbors[a].add(b)
        neighbors[b].add(a)
    groups = sorted({g for g in region.values() if g})
    r = random.Random(seed)
    shell = 15.0

    # start: connected spheres in a ball near their neighbors, the rest on the outer shell
    for i in ids:
        if i in fixed:
            continue
        if neighbors[i]:
            base = [0.0, 0.0, 0.0]
            anchors = [pos[n] for n in neighbors[i] if n in fixed]
            if anchors:
                base = [sum(p[k] for p in anchors) / len(anchors) for k in range(3)]
            u = random_unit(r)
            pos[i] = [base[k] + u[k] * r.uniform(2.5, 6.5) for k in range(3)]
        else:
            u = random_unit(r)
            pos[i] = [u[k] * shell * r.uniform(0.9, 1.1) for k in range(3)]

    def centroid(g: str) -> Vec:
        m = [i for i in ids if region[i] == g]
        return [sum(pos[i][k] for i in m) / len(m) for k in range(3)]

    for step in range(steps):
        heat = 1 - step / steps
        force = {i: [0.0, 0.0, 0.0] for i in ids}

        def push(i: str, v: Vec, f: float, force: dict[str, Vec] = force) -> None:
            force[i][0] += f * v[0]
            force[i][1] += f * v[1]
            force[i][2] += f * v[2]

        for x in range(len(ids)):
            for y in range(x + 1, len(ids)):
                a, b = ids[x], ids[y]
                dv = sub(pos[a], pos[b])
                dist = norm(dv) or 0.01
                u = [c / dist for c in dv]
                want = (size[a] + size[b]) * 1.8 + 1.2
                f = 2.0 / (dist * dist) + (2.4 * (want - dist) if dist < want else 0.0)
                push(a, u, f)
                push(b, u, -f)
        for a, b in edges:
            same = region[a] is not None and region[a] == region[b]
            length = 3.0 if same else 4.8
            dv = sub(pos[b], pos[a])
            dist = norm(dv) or 0.01
            u = [c / dist for c in dv]
            # a current that leaves a group pulls gently, so the group stays together
            leaves = not same and (region[a] is not None or region[b] is not None)
            f = (0.03 if leaves else 0.3) * (dist - length)
            push(a, u, f)
            push(b, u, -f)
        for g in groups:
            c = centroid(g)
            members = [i for i in ids if region[i] == g]
            reach = max(norm(sub(pos[i], c)) + size[i] * 1.9 for i in members) + 0.6
            for i in members:
                push(i, sub(c, pos[i]), 0.45)
            for i in ids:
                if region[i] == g:
                    continue
                dv = sub(pos[i], c)
                dist = norm(dv) or 0.01
                edge = reach + size[i] * 1.6 + 0.4
                if dist < edge:
                    push(i, [v / dist for v in dv], 1.6 * (edge - dist))
        for i in ids:
            dist = norm(pos[i]) or 0.01
            if neighbors[i]:
                push(i, pos[i], -0.012)  # a light pull toward the middle keeps the cloud together
            else:
                push(i, [v / dist for v in pos[i]], 0.1 * (shell - dist))  # loose spheres keep to the shell
        for i in ids:
            if i in fixed:
                continue
            for k in range(3):
                pos[i][k] += max(-0.35, min(0.35, force[i][k] * 0.045 * (0.25 + heat)))

    for s in spheres:
        s.setdefault("map", {})["pos"] = [round(v, 2) for v in pos[s["id"]]]
    return d


def report(d: dict) -> str:
    sp = d["spheres"]
    pts = {s["id"]: (s["map"]["pos"], s["map"].get("size", 1)) for s in sp}
    keys = list(pts)
    gap = min(norm(sub(pts[a][0], pts[b][0])) - pts[a][1] - pts[b][1] for x, a in enumerate(keys) for b in keys[x + 1:])
    zs = [p[0][2] for p in pts.values()]
    return f"{len(sp)} spheres, closest gap {gap:.2f}, depth (z) from {min(zs):.1f} to {max(zs):.1f}"


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--new", action="store_true", help="move only spheres still at [0, 0, 0]")
    ap.add_argument("--seed", type=int, default=7)
    ap.add_argument("--dry-run", action="store_true")
    a = ap.parse_args()
    d = layout(orrery.load_full(), a.seed, a.new)
    errs = orrery.validate(d)
    if errs:
        print("\n".join(errs))
        return 1
    print(report(d))
    if not a.dry_run:
        orrery.save_full(d)
        print("saved the atlas")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
