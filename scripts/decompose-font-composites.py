#!/usr/bin/env python3
"""
decompose-font-composites.py — decompõe, no lugar, os glifos compostos das fontes
auto-hospedadas que não saem de um `build-*.py` (Atkinson Hyperlegible, Lexend).
Idempotente: arquivo sem composto fica intocado. Motivo e guarda: `font_composites.py`.

    python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools
    /tmp/fontvenv/bin/python scripts/decompose-font-composites.py
"""

import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))

from fontTools.ttLib import TTFont  # noqa: E402
from font_composites import decompose_composites  # noqa: E402

FONTS_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"
PREFIXES = ("AtkinsonHyperlegible", "Lexend")


def main() -> None:
    for path in sorted(FONTS_DIR.glob("*.ttf")):
        if not path.name.startswith(PREFIXES):
            continue
        font = TTFont(path)
        n = decompose_composites(font)
        if n:
            font.save(path)
        font.close()
        print(f"{path.name}: {n} compostos decompostos" if n else f"{path.name}: sem compostos, intocado")


if __name__ == "__main__":
    main()
