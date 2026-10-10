#!/usr/bin/env python3
"""Draw the plane emblems of the Great Wheel view as SVG line art.

  tools/design/emblems.py [--sheet OUT.png]

One emblem per plane: a medallion (two rings, with one tick on the outer ring per layer of the
plane) around a glyph. White strokes on a transparent ground; the map tints them with each plane's
color. Writes site/assets/emblems/<id>.svg. Every glyph is plain geometry drawn here.
"""
from __future__ import annotations

import math
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "site" / "assets" / "emblems"
C = 128          # center
SW = 5.5         # stroke width of the glyphs


def f(v: float) -> str:
    return f"{v:.1f}".rstrip("0").rstrip(".")


def poly(pts, close=False) -> str:
    d = "M " + " L ".join(f"{f(x)} {f(y)}" for x, y in pts)
    return d + (" Z" if close else "")


def circle(cx, cy, r, **kw) -> str:
    extra = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<circle cx="{f(cx)}" cy="{f(cy)}" r="{f(r)}" {extra}/>'


def path(d, **kw) -> str:
    extra = " ".join(f'{k.replace("_", "-")}="{v}"' for k, v in kw.items())
    return f'<path d="{d}" {extra}/>'


def frame(layers: int | None) -> list[str]:
    out = [circle(C, C, 120, stroke_width=3), circle(C, C, 108, stroke_width=1.5, opacity=".7")]
    n = layers or 0
    if n:
        # one tick per layer around the top of the ring; an "infinite" plane gets a full ring of dots
        if n >= 99:
            for k in range(48):
                a = k / 48 * math.tau
                out.append(circle(C + 114 * math.cos(a), C + 114 * math.sin(a), 1.6, fill="white", stroke="none"))
        else:
            span = min(math.pi * 0.9, (n - 1) * 0.16)
            for k in range(n):
                a = -math.pi / 2 + (k - (n - 1) / 2) * (span / max(n - 1, 1))
                x0, y0 = C + 108 * math.cos(a), C + 108 * math.sin(a)
                x1, y1 = C + 120 * math.cos(a), C + 120 * math.sin(a)
                out.append(path(poly([(x0, y0), (x1, y1)]), stroke_width=4))
    return out


def star(cx, cy, r, points=4, inner=0.28):
    pts = []
    for k in range(points * 2):
        rr = r if k % 2 == 0 else r * inner
        a = -math.pi / 2 + k * math.pi / points
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return path(poly(pts, True))


# ---------- glyphs ----------
def celestia():
    out, base, w = [], 186, 150
    pts = [(C - w / 2, base)]
    for k in range(7):  # seven terraces, each a step in from the last
        y = base - (k + 1) * 15
        x_l, x_r = C - w / 2 + (k + 1) * 9.5, C + w / 2 - (k + 1) * 9.5
        pts += [(x_l - 9.5 + 9.5, y + 15)] if False else []
    left = [(C - w / 2 + k * 9.5, base - k * 15) for k in range(8)]
    stairs_l, stairs_r = [], []
    for k in range(7):
        x, y = C - w / 2 + k * 9.5, base - k * 15
        stairs_l += [(x, y), (x, y - 15), (x + 9.5, y - 15)][: 3]
        xr = C + w / 2 - k * 9.5
        stairs_r += [(xr, y), (xr, y - 15), (xr - 9.5, y - 15)]
    top_l, top_r = stairs_l[-1], stairs_r[-1]
    out.append(path(poly([(C - w / 2, base)] + stairs_l[1:] + [top_r] + list(reversed(stairs_r[1:])) + [(C + w / 2, base)], True)))
    out.append(star(C, 52, 20, 4, 0.22))
    out.append(path(poly([(C - 82, base + 8), (C + 82, base + 8)]), stroke_width=3))
    return out


def bytopia():
    lo = [(46, 172), (70, 148), (88, 160), (112, 132), (134, 154), (156, 136), (182, 160), (210, 148)]
    hi = [(x, 256 - y) for x, y in lo]
    return [path(poly([(46, 186)] + lo + [(210, 186)])), path(poly([(46, 70)] + hi + [(210, 70)])),
            circle(C, C, 9, fill="white", stroke="none")]


def elysium():
    out = []
    # a lotus: three petals over still water
    out.append(path(f"M {C} 150 C {C - 26} 120 {C - 18} 82 {C} 66 C {C + 18} 82 {C + 26} 120 {C} 150 Z"))
    out.append(path(f"M {C - 6} 150 C {C - 46} 140 {C - 64} 112 {C - 60} 92 C {C - 36} 98 {C - 18} 120 {C - 6} 150"))
    out.append(path(f"M {C + 6} 150 C {C + 46} 140 {C + 64} 112 {C + 60} 92 C {C + 36} 98 {C + 18} 120 {C + 6} 150"))
    for k, y in enumerate((168, 184, 198)):
        w = 70 - k * 14
        out.append(path(f"M {C - w} {y} q {w / 4} -8 {w / 2} 0 t {w / 2} 0 t {w / 2} 0 t {w / 2} 0", stroke_width=3.5))
    return out


def beastlands():
    out = [path(f"M {C} 180 C {C - 34} 180 {C - 40} 150 {C - 22} 134 C {C - 8} 122 {C + 8} 122 {C + 22} 134 C {C + 40} 150 {C + 34} 180 {C} 180 Z")]
    for x, y, rx, ry, rot in ((C - 46, 112, 12, 17, -24), (C - 17, 86, 12, 18, -8), (C + 17, 86, 12, 18, 8), (C + 46, 112, 12, 17, 24)):
        out.append(f'<ellipse cx="{x}" cy="{y}" rx="{rx}" ry="{ry}" transform="rotate({rot} {x} {y})"/>')
    return out


def arborea():
    out = []
    for side in (-1, 1):  # a laurel wreath, open at the top
        pts = []
        for k in range(16):
            a = math.radians(110 + k * 9.2) if side < 0 else math.radians(70 - k * 9.2)
            pts.append((C + 70 * math.cos(a), C + 12 + 70 * math.sin(a)))
        out.append(path(poly(pts)))
        for k in range(1, 15, 2):
            a = math.radians(110 + k * 9.2) if side < 0 else math.radians(70 - k * 9.2)
            x, y = C + 70 * math.cos(a), C + 12 + 70 * math.sin(a)
            for s in (-1, 1):
                ang = a + side * math.pi / 2 + s * 0.6
                lx, ly = x + 22 * math.cos(ang + math.pi), y + 22 * math.sin(ang + math.pi)
                out.append(path(f"M {f(x)} {f(y)} Q {f((x + lx) / 2 + 6 * s)} {f((y + ly) / 2 - 6)} {f(lx)} {f(ly)}", stroke_width=3.5))
    out.append(star(C, 70, 10, 4, 0.3))
    return out


def ysgard():
    top = [(58, 128), (198, 128)]
    under = [(198, 128), (180, 150), (166, 146), (150, 176), (136, 170), (124, 200), (112, 168), (96, 174), (80, 148), (66, 152), (58, 128)]
    out = [path(poly(top)), path(poly(under))]
    # a tree on the earthberg
    out.append(path(f"M {C} 128 L {C} 84"))
    for y, w in ((96, 26), (80, 20), (66, 13)):
        out.append(path(poly([(C - w, y + 8), (C, y - 10), (C + w, y + 8)])))
    return out


def limbo():
    pts = []
    for k in range(220):
        t = k / 220 * 3.1 * math.tau
        r = 6 + 70 * k / 220
        pts.append((C + r * math.cos(t), C + r * math.sin(t)))
    out = [path(poly(pts))]
    for x, y, s in ((60, 70, 9), (196, 82, 7), (188, 186, 10), (70, 190, 6)):
        out.append(path(poly([(x - s, y), (x, y - s * 1.3), (x + s, y + s * 0.4)], True), stroke_width=3))
    return out


def pandemonium():
    out = []
    for k in range(6):
        rx, ry = 78 - k * 12, 58 - k * 9
        cx = C - k * 5
        out.append(f'<ellipse cx="{f(cx)}" cy="{C}" rx="{f(rx)}" ry="{f(ry)}" stroke-width="{f(SW - k * 0.5)}" opacity="{f(1 - k * 0.1)}"/>')
    for y in (40, 216):
        out.append(path(f"M 48 {y} q 20 -10 40 0 t 40 0 t 40 0 t 40 0", stroke_width=3.5))
    return out


def abyss():
    out = []
    for k in range(7):  # jagged rings, each smaller and lower: the layers going down forever
        r = 78 - k * 10
        pts = []
        n = 18
        for j in range(n + 1):
            a = j / n * math.tau
            rr = r * (1 + (0.08 if j % 2 else -0.04))
            pts.append((C + rr * math.cos(a), C + 10 + k * 3 + rr * 0.62 * math.sin(a)))
        out.append(path(poly(pts), stroke_width=f(SW - k * 0.55), opacity=f(1 - k * 0.11)))
    out.append(circle(C, C + 31, 5, fill="white", stroke="none"))
    return out


def carceri():
    # six orbs, each inside the last, all touching at the bottom: prisons within prisons
    return [circle(C, 196 - r, r, stroke_width=f(SW - k * 0.4)) for k, r in enumerate((76, 62, 49, 37, 26, 16))]


def graywaste():
    out = [path(poly([(42, 176), (214, 176)])), circle(C + 34, 86, 22)]
    out.append(path(f"M {C - 30} 176 L {C - 30} 118 M {C - 30} 140 L {C - 50} 118 M {C - 30} 132 L {C - 12} 110 M {C - 30} 118 L {C - 38} 100"))
    for k, x in enumerate((60, 92, 160, 196)):
        out.append(path(poly([(x - 10, 192 + k % 2 * 6), (x + 10, 192 + k % 2 * 6)]), stroke_width=3))
    return out


def gehenna():
    out = []
    for k, (x, h) in enumerate(((70, 62), (110, 96), (150, 80), (190, 56))):
        out.append(path(poly([(x - 34, 190), (x + 6, 190 - h), (x + 26, 190)])))
    for x, y in ((112, 82), (152, 100), (98, 70), (160, 90)):
        out.append(circle(x, y, 2.6, fill="white", stroke="none"))
    out.append(path(poly([(36, 190), (220, 190)]), stroke_width=3))
    return out


def baator():
    # nine steps going down: the mirror of Mount Celestia
    out, top, w = [], 64, 150
    left, right = [], []
    for k in range(9):
        y = top + k * 12
        xl, xr = C - w / 2 + k * 8.3, C + w / 2 - k * 8.3
        left += [(xl, y), (xl, y + 12), (xl + 8.3, y + 12)]
        right += [(xr, y), (xr, y + 12), (xr - 8.3, y + 12)]
    out.append(path(poly(left + list(reversed(right)), True)))
    out.append(path(f"M {C} 188 q -10 -14 0 -26 q 10 12 0 26 Z", stroke_width=3.5))
    out.append(path(poly([(C - 82, top - 8), (C + 82, top - 8)]), stroke_width=3))
    return out


def cube(cx, cy, s, rot):
    a = math.radians(rot)
    def p(x, y):
        return (cx + x * math.cos(a) - y * math.sin(a), cy + x * math.sin(a) + y * math.cos(a))
    h = s / 2
    front = [p(-h, -h * 0.2), p(0, h * 0.35), p(h, -h * 0.2), p(0, -h * 0.75)]
    return [path(poly(front, True)), path(poly([p(-h, -h * 0.2), p(-h, h * 0.9), p(0, h * 1.45), p(0, h * 0.35)])), path(poly([p(0, h * 1.45), p(h, h * 0.9), p(h, -h * 0.2)]))]


def acheron():
    out = cube(92, 112, 66, -8) + cube(166, 136, 54, 12)
    for x, y in ((128, 120), (134, 108), (122, 134)):
        out.append(path(poly([(x - 6, y), (x + 6, y)]), stroke_width=3))
    return out


def gear(cx, cy, r, teeth, phase=0.0):
    pts = []
    for k in range(teeth * 4):
        a = phase + k / (teeth * 4) * math.tau
        rr = r + (9 if (k % 4) in (1, 2) else 0)
        pts.append((cx + rr * math.cos(a), cy + rr * math.sin(a)))
    return [path(poly(pts, True)), circle(cx, cy, r * 0.38)]


def mechanus():
    return gear(98, 110, 44, 10) + gear(170, 160, 30, 7, 0.22)


def arcadia():
    out = [circle(C, 84, 30), path(f"M {C} 54 A 30 30 0 0 1 {C} 114 Z", fill="white", stroke="none")]
    for row in range(3):
        for col in range(5):
            x, y = 64 + col * 32, 146 + row * 20
            out.append(path(f"M {x} {y + 8} L {x} {y}"))
            out.append(circle(x, y - 5, 6))
    return out


def outlands():
    out = [f'<ellipse cx="{C}" cy="186" rx="80" ry="18"/>', f'<ellipse cx="{C}" cy="186" rx="52" ry="11" stroke-width="3"/>']
    out.append(path(poly([(C - 7, 186), (C, 38), (C + 7, 186)], True)))
    for k in range(16):
        a = k / 16 * math.tau
        x, y = C + 80 * math.cos(a), 186 + 18 * math.sin(a)
        out.append(circle(x, y, 2.4, fill="white", stroke="none"))
    return out


def sigil():
    out = [f'<ellipse cx="{C}" cy="{C}" rx="70" ry="30"/>', f'<ellipse cx="{C}" cy="{C}" rx="40" ry="14" stroke-width="3.5"/>']
    for k in range(10):  # the blades around the Lady's halo
        a = k / 10 * math.tau
        x0, y0 = C + 74 * math.cos(a), C + 32 * math.sin(a)
        x1, y1 = C + 104 * math.cos(a), C + 52 * math.sin(a)
        out.append(path(poly([(x0, y0), (x1, y1)]), stroke_width=4))
    return out


def prime():
    out = []
    for x, y, r in ((C, C, 34), (C - 56, C + 30, 18), (C + 52, C - 34, 14), (C + 58, C + 42, 10), (C - 46, C - 46, 9)):
        out.append(circle(x, y, r))
        out.append(f'<ellipse cx="{f(x)}" cy="{f(y)}" rx="{f(r)}" ry="{f(r * 0.35)}" stroke-width="2.5" opacity=".7"/>')
    return out


def astral():
    pts = []
    for k in range(200):
        t = k / 200
        pts.append((C - 80 + 160 * t, C + 28 * math.sin(t * math.tau * 1.5)))
    return [path(poly(pts)), circle(C - 80, C, 6, fill="white", stroke="none"), circle(C + 80, C + 28 * math.sin(math.tau * 1.5), 6, fill="white", stroke="none"), star(C, C - 54, 14, 4, 0.25)]


def ethereal():
    out = []
    for k in range(4):
        x = 64 + k * 42
        out.append(path(f"M {x} 52 C {x + 20} 92 {x - 20} 132 {x} 172 C {x + 12} 190 {x + 6} 204 {x} 212", stroke_width=f(SW - k * 0.6), opacity=f(1 - k * 0.15)))
    return out


def shadow():
    return [circle(C, C, 54), path(f"M {C + 24} {C - 49} A 54 54 0 1 1 {C + 24} {C + 49} A 40 54 0 1 0 {C + 24} {C - 49} Z", fill="white", stroke="none")]


def element(kind):
    if kind == "fire":
        return [path(f"M {C} 196 C {C - 52} 186 {C - 52} 130 {C - 18} 96 C {C - 14} 116 {C - 4} 122 {C + 2} 122 C {C - 6} 98 {C + 6} 70 {C + 22} 56 C {C + 20} 90 {C + 54} 116 {C + 50} 156 C {C + 48} 182 {C + 26} 196 {C} 196 Z")]
    if kind == "water":
        return [path(f"M {C - 72} {y} q 18 -16 36 0 t 36 0 t 36 0 t 36 0", stroke_width=f(SW - i * 0.5)) for i, y in enumerate((96, 128, 160))]
    if kind == "air":
        return [path(f"M 52 104 L 152 104 C 186 104 186 60 156 64"), path(f"M 64 136 L 176 136 C 214 136 210 190 176 182"), path(f"M 52 168 L 118 168")]
    if kind == "earth":
        return [path(poly([(C, 52), (C + 56, 108), (C + 34, 196), (C - 34, 196), (C - 56, 108)], True)), path(poly([(C - 56, 108), (C, 128), (C + 56, 108)])), path(poly([(C, 128), (C, 196)]))]
    if kind == "positive":
        return [circle(C, C, 22, fill="white", stroke="none")] + [path(poly([(C + 34 * math.cos(a), C + 34 * math.sin(a)), (C + 80 * math.cos(a), C + 80 * math.sin(a))]), stroke_width=4) for a in [k / 16 * math.tau for k in range(16)]]
    if kind == "negative":
        return [circle(C, C, 60), circle(C, C, 40, stroke_width=3, opacity=".6"), circle(C, C, 22, stroke_width=2, opacity=".4")]
    return []


GLYPHS = {
    "mount-celestia": (celestia, 7), "bytopia": (bytopia, 2), "elysium": (elysium, 4), "beastlands": (beastlands, 3),
    "arborea": (arborea, 3), "ysgard": (ysgard, 3), "limbo": (limbo, 1), "pandemonium": (pandemonium, 4),
    "abyss": (abyss, 99), "carceri": (carceri, 6), "gray-waste": (graywaste, 3), "gehenna": (gehenna, 4),
    "nine-hells": (baator, 9), "acheron": (acheron, 4), "mechanus": (mechanus, 1), "arcadia": (arcadia, 3),
    "outlands": (outlands, 1), "sigil": (sigil, None), "prime": (prime, None), "astral": (astral, None),
    "ethereal": (ethereal, None), "shadow": (shadow, None),
    "fire": (lambda: element("fire"), None), "water": (lambda: element("water"), None), "air": (lambda: element("air"), None),
    "earth": (lambda: element("earth"), None), "positive": (lambda: element("positive"), None), "negative": (lambda: element("negative"), None),
}


def svg(name: str) -> str:
    fn, layers = GLYPHS[name]
    body = frame(layers) + fn()
    return ('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 256 256" width="256" height="256">'
            f'<g fill="none" stroke="white" stroke-width="{SW}" stroke-linecap="round" stroke-linejoin="round">' + "".join(body) + "</g></svg>\n")


def main() -> int:
    OUT.mkdir(parents=True, exist_ok=True)
    for name in GLYPHS:
        (OUT / f"{name}.svg").write_text(svg(name))
    print(f"wrote {len(GLYPHS)} emblems to {OUT}")
    if "--sheet" in sys.argv:
        out = Path(sys.argv[sys.argv.index("--sheet") + 1])
        cells = "".join(f'<div style="display:inline-block;width:150px;margin:6px;text-align:center;color:#9aa4b8;font:12px Inter,Helvetica">'
                        f'<img src="{(OUT / (n + ".svg")).as_uri()}" width="128" height="128" style="filter:drop-shadow(0 0 6px #9db4ff)"><br>{n}</div>' for n in GLYPHS)
        html = f'<html><body style="margin:0;background:#070912;padding:16px;width:1200px">{cells}</body></html>'
        tmp = out.with_suffix(".html")
        tmp.write_text(html)
        from playwright.sync_api import sync_playwright
        with sync_playwright() as p:
            br = p.chromium.launch()
            pg = br.new_page(viewport={"width": 1232, "height": 760})
            pg.goto(tmp.as_uri())
            pg.screenshot(path=str(out), full_page=True)
            br.close()
        print("sheet:", out)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
