#!/usr/bin/env python3
"""
strip-font-ligatures.py — remove the `liga` (standard ligatures) feature from the
self-hosted fonts in `public/fonts/`.

Why: `liga` is ON by default both in the browser and in fontkit (used by
@react-pdf), and nothing in the app can turn it off for the PDF — `<Text>` has no
font-feature prop. So the only fix that keeps screen and PDF in parity is to ship
assets without the feature.

The damage is worst exactly where it hurts most: in OpenDyslexic the `fi` ligature
advances 630 units against 1058 for `f`+`i` separately (−40%), so every `fi` in a
word collapses into a narrow fused glyph — the opposite of the uniform, wide letter
spacing the font is chosen for. See finding 0214.

Everything else is preserved: all glyphs, all other GSUB/GPOS features (`ccmp`,
`frac`, `dlig`, `salt`, `ss01`, …), names, hinting and vertical metrics. Only the
`liga` feature and the lookups that become unreachable are dropped.

Usage (needs fonttools, not a project dependency — run in a throwaway venv):

    python3 -m venv /tmp/fontvenv && /tmp/fontvenv/bin/pip install fonttools
    /tmp/fontvenv/bin/python scripts/strip-font-ligatures.py

The result is locked in by `src/components/adaptation/render/pdf/fontAssets.test.ts`.
"""

from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

FONTS_DIR = Path(__file__).resolve().parent.parent / "public" / "fonts"


def feature_tags(font: TTFont) -> set[str]:
    tags: set[str] = set()
    for table_tag in ("GSUB", "GPOS"):
        if table_tag in font:
            feature_list = font[table_tag].table.FeatureList
            if feature_list is not None:
                tags.update(r.FeatureTag for r in feature_list.FeatureRecord)
    return tags


def strip_liga(path: Path) -> bool:
    font = TTFont(path)
    tags = feature_tags(font)
    if "liga" not in tags:
        font.close()
        return False

    options = subset.Options()
    # Keep every layout feature the font already had, minus `liga`.
    options.layout_features = sorted(tags - {"liga"})
    options.glyph_names = True
    options.notdef_outline = True
    options.recalc_bounds = False
    options.recalc_timestamp = False
    options.hinting = True
    options.legacy_kern = True
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    options.name_legacy = True
    options.passthrough_tables = True

    subsetter = subset.Subsetter(options=options)
    # Retain the complete glyph set: this is a feature strip, not a subset.
    subsetter.populate(glyphs=font.getGlyphOrder())
    subsetter.subset(font)
    font.save(path)
    font.close()
    return True


def main() -> None:
    for path in sorted(FONTS_DIR.glob("*.ttf")):
        print(f"{path.name}: {'liga removed' if strip_liga(path) else 'no liga, untouched'}")


if __name__ == "__main__":
    main()
