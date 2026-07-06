/**
 * fontAssets.test.ts — regression guard for the "font corrupts/breaks the
 * Adaptar PDF" bug class (invisible text on export).
 *
 * Root cause history: the OpenDyslexic files shipped as OpenType/CFF ("OTTO",
 * magic 0x4F54544F). fontkit (used by @react-pdf) subsets CFF outlines
 * incorrectly for the embedded PDF program, so glyphs render invisible. The fix
 * re-shipped them as real TrueType (glyf outlines, magic 0x00010000). This test
 * locks that in at the SOURCE-ASSET level so a corrupt font can never land in
 * `public/fonts/` again.
 *
 * Two independent guarantees per file:
 *   (a) Magic bytes are 0x00010000 (real TrueType). OTTO/CFF and any other sfnt
 *       flavour is rejected — see the failure message for the detected tag.
 *   (b) The cmap covers the essential pt-BR letters (accents + cedilla) and the
 *       em dash — a font missing these renders tofu/blanks in adapted activities.
 *
 * The sfnt/cmap parsing is intentionally minimal and inline (no new dependency):
 * it reads the offset table, locates `cmap`, picks the best Unicode subtable and
 * resolves each codepoint via format 0/4/6/12. Because this is a `*.test.ts`
 * file it is excluded from the coverage gate, so the parser needs no coverage.
 *
 * NOTE: raw byte inspection is unaffected by the jsdom subset-corruption caveat
 * (see the Node smoke script `scripts/pdf-font-smoke.mjs`) — we never subset
 * here, we only read bytes, which behaves identically under jsdom and Node.
 */

import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/** Absolute path to the shipped web fonts (Vitest's cwd is the repo root). */
const FONTS_DIR = join(process.cwd(), "public", "fonts");

/** sfnt flavour tags we may encounter, for human-readable failure messages. */
const SFNT_FLAVOURS: Record<number, string> = {
  0x00010000: "TrueType (glyf, 0x00010000)",
  0x4f54544f: "OpenType/CFF 'OTTO' — forbidden: fontkit corrupts CFF subsets → invisible PDF text",
  0x74727565: "Apple TrueType 'true'",
  0x74746366: "TrueType Collection 'ttcf'",
  0x74797031: "PostScript Type 1 'typ1'",
  0x774f4646: "WOFF 'wOFF'",
  0x774f4632: "WOFF2 'wOF2'",
};

/** The pt-BR characters an adapted activity must be able to print. */
const PT_BR_ESSENTIAL = ["á", "é", "í", "ó", "ú", "â", "ê", "ô", "ã", "õ", "à", "ç", "Ç", "—"];

const u16 = (buf: Buffer, off: number): number => buf.readUInt16BE(off);
const u32 = (buf: Buffer, off: number): number => buf.readUInt32BE(off);

/** Locate a top-level sfnt table by its 4-char tag. */
function findTable(buf: Buffer, tag: string): { offset: number; length: number } | null {
  const numTables = u16(buf, 4);
  for (let i = 0, p = 12; i < numTables; i++, p += 16) {
    if (buf.toString("latin1", p, p + 4) === tag) {
      return { offset: u32(buf, p + 8), length: u32(buf, p + 12) };
    }
  }
  return null;
}

/**
 * Pick the most capable Unicode cmap subtable and return its absolute offset.
 * Preference: (3,10) UCS-4 > (0,4/6) Unicode full > (3,1) Windows BMP > (0,*) .
 */
function selectUnicodeSubtable(buf: Buffer, cmapOff: number): number | null {
  const numSub = u16(buf, cmapOff + 2);
  let best: number | null = null;
  let bestScore = -1;
  for (let i = 0; i < numSub; i++) {
    const rec = cmapOff + 4 + i * 8;
    const plat = u16(buf, rec);
    const enc = u16(buf, rec + 2);
    const subOff = u32(buf, rec + 4);
    let score = -1;
    if (plat === 3 && enc === 10) score = 5;
    else if (plat === 0 && (enc === 4 || enc === 6)) score = 4;
    else if (plat === 3 && enc === 1) score = 3;
    else if (plat === 0) score = 2;
    if (score > bestScore) {
      bestScore = score;
      best = cmapOff + subOff;
    }
  }
  return best;
}

/** Resolve a codepoint to a glyph id (0 = .notdef / uncovered) within a subtable. */
function glyphIdFor(buf: Buffer, subOff: number, cp: number): number {
  const format = u16(buf, subOff);
  if (format === 0) {
    return cp > 255 ? 0 : buf.readUInt8(subOff + 6 + cp);
  }
  if (format === 6) {
    const first = u16(buf, subOff + 6);
    const count = u16(buf, subOff + 8);
    return cp < first || cp >= first + count ? 0 : u16(buf, subOff + 10 + (cp - first) * 2);
  }
  if (format === 4) {
    const segX2 = u16(buf, subOff + 6);
    const endBase = subOff + 14;
    const startBase = endBase + segX2 + 2; // + reservedPad(2)
    const deltaBase = startBase + segX2;
    const rangeBase = deltaBase + segX2;
    for (let s = 0; s < segX2 / 2; s++) {
      if (cp <= u16(buf, endBase + s * 2)) {
        const start = u16(buf, startBase + s * 2);
        if (cp < start) return 0;
        const idDelta = u16(buf, deltaBase + s * 2);
        const idRangeOffset = u16(buf, rangeBase + s * 2);
        if (idRangeOffset === 0) return (cp + idDelta) & 0xffff;
        const g = u16(buf, rangeBase + s * 2 + idRangeOffset + (cp - start) * 2);
        return g === 0 ? 0 : (g + idDelta) & 0xffff;
      }
    }
    return 0;
  }
  if (format === 12) {
    const nGroups = u32(buf, subOff + 12);
    for (let g = 0, p = subOff + 16; g < nGroups; g++, p += 12) {
      const startC = u32(buf, p);
      if (cp >= startC && cp <= u32(buf, p + 4)) return u32(buf, p + 8) + (cp - startC);
    }
    return 0;
  }
  throw new Error(`Unsupported cmap subtable format ${format}`);
}

const fontFiles = readdirSync(FONTS_DIR)
  .filter((f) => f.toLowerCase().endsWith(".ttf"))
  .sort();

describe("public/fonts/*.ttf — binary integrity (PDF corruption guard)", () => {
  it("finds the shipped .ttf assets (guards against a vacuous pass)", () => {
    expect(fontFiles.length).toBeGreaterThan(0);
  });

  it.each(fontFiles)("%s is real TrueType (magic 0x00010000, not OTTO/CFF)", (file) => {
    const buf = readFileSync(join(FONTS_DIR, file));
    const magic = u32(buf, 0);
    const detected = SFNT_FLAVOURS[magic] ?? `unknown sfnt flavour 0x${magic.toString(16).padStart(8, "0")}`;
    expect(magic, `${file}: expected TrueType 0x00010000 but got ${detected}`).toBe(0x00010000);
  });

  it.each(fontFiles)("%s cmap covers every essential pt-BR character", (file) => {
    const buf = readFileSync(join(FONTS_DIR, file));
    const cmap = findTable(buf, "cmap");
    expect(cmap, `${file}: no cmap table`).not.toBeNull();
    const subOff = selectUnicodeSubtable(buf, cmap!.offset);
    expect(subOff, `${file}: no Unicode cmap subtable`).not.toBeNull();

    const missing = PT_BR_ESSENTIAL.filter((ch) => glyphIdFor(buf, subOff!, ch.codePointAt(0)!) === 0);
    expect(
      missing,
      `${file}: cmap is missing glyphs for ${missing
        .map((c) => `'${c}' (U+${c.codePointAt(0)!.toString(16).toUpperCase().padStart(4, "0")})`)
        .join(", ")}`,
    ).toEqual([]);
  });
});
