#!/usr/bin/env python3
"""Text of a sourcebook PDF in reading order: each page's left column, then its right column.

  tools/columns.py IN.pdf OUT.txt [--cols N]

Most TSR books print two columns, so a plain pdftotext -layout puts the two columns side by side
and a stat block's labels and values fall apart. This crops each page into N columns (default 2)
and writes them one after the other. Each page starts with a line "=== PDF PAGE n ===". Needs
pdftotext and pdfinfo (poppler). Run OCR first if the PDF has no text layer (ocrmypdf).
"""
from __future__ import annotations

import argparse
import subprocess


def sizes(pdf: str) -> list[tuple[float, float]]:
    """The width and height of every page (a scan can mix sizes: a box cover, then booklets)."""
    out = subprocess.run(["pdfinfo", pdf], capture_output=True, text=True, check=True).stdout
    pages = int(next(line for line in out.splitlines() if line.startswith("Pages:")).split()[1])
    out = subprocess.run(["pdfinfo", "-f", "1", "-l", str(pages), pdf], capture_output=True, text=True, check=True).stdout
    found = {}
    for line in out.splitlines():
        parts = line.split()
        if len(parts) >= 7 and parts[0] == "Page" and parts[2] == "size:":
            found[int(parts[1])] = (float(parts[3]), float(parts[5]))
    return [found.get(n, (612.0, 792.0)) for n in range(1, pages + 1)]


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("pdf")
    ap.add_argument("out")
    ap.add_argument("--cols", type=int, default=2)
    a = ap.parse_args()
    page_sizes = sizes(a.pdf)
    pages = len(page_sizes)
    with open(a.out, "w") as f:
        for n in range(1, pages + 1):
            w, h = page_sizes[n - 1]
            f.write(f"\n=== PDF PAGE {n} ===\n")
            for c in range(a.cols):
                x0 = int(w * c / a.cols)
                txt = subprocess.run(["pdftotext", "-layout", "-f", str(n), "-l", str(n), "-x", str(x0), "-y", "0",
                                      "-W", str(int(w / a.cols) + 2), "-H", str(int(h)), a.pdf, "-"],
                                     capture_output=True, text=True, check=False).stdout
                f.write(txt.replace("\f", "").rstrip() + "\n")
    print(f"{pages} pages")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
