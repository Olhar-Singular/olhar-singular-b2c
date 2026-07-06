#!/usr/bin/env node
/**
 * pdf-font-smoke.mjs — real @react-pdf render smoke test in PURE Node.
 *
 * WHY A STANDALONE NODE SCRIPT (not a Vitest test):
 * The Vitest suite runs under jsdom, and jsdom corrupts fontkit's TrueType
 * subsetting — so a subset-corruption regression (the "invisible PDF text" bug)
 * produces a FALSE NEGATIVE there (documented). This harness runs under a clean
 * Node process where fontkit behaves like production, registers the REAL font
 * files with filesystem paths, and actually renders a PDF exercising all three
 * accessibility families across all four weight×style variants with pt-BR text
 * (accents, cedilla, em dash).
 *
 * HOW IT CATCHES THE BUG (measured):
 * The corruption does NOT throw and does NOT emit a poppler error — it renders
 * (nearly) blank. A healthy page rasterizes to well over 1% dark-pixel
 * coverage; a corrupt (CFF-subset "invisible glyph") page collapses to ~0.0x%.
 * So the authoritative signal is INK COVERAGE, measured on ONE PAGE PER
 * FAMILY × VARIANT (weight/style combination), with every line on the page in
 * that single face. Per-variant granularity matters: a single corrupt file
 * inside a family (e.g. only the Italic) must not hide behind the family's
 * healthy faces — a per-family page stays above any reasonable floor when 4 of
 * its 5 lines are healthy (measured: 1.45% vs the 0.5% floor).
 *
 * It fails (non-zero exit) when:
 *   - registration/render throws (e.g. "Could not resolve font" for a variant),
 *   - the output is not a parseable PDF,
 *   - poppler is available and `pdftoppm` exits non-zero or logs an error, or
 *   - poppler is available and any family×variant page renders below
 *     MIN_INK_PCT ink (glyphs invisible → the font-corruption regression).
 *
 * When `pdftoppm` is absent the deep rasterization check is SKIPPED (and loudly
 * reported — never silently) so a green local run is not mistaken for full
 * coverage. CI installs poppler-utils so the deep check always runs there.
 *
 * Run: `node scripts/pdf-font-smoke.mjs`  (npm: `npm run test:pdf-smoke`)
 */

import { createElement as h } from "react";
import { Font, renderToBuffer, Document, Page, Text, View } from "@react-pdf/renderer";
import { fileURLToPath } from "node:url";
import { existsSync, writeFileSync, mkdtempSync, rmSync, readdirSync, readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir } from "node:os";
import { join } from "node:path";

/** Minimum dark-pixel coverage a healthy family×variant page must reach (see header). */
const MIN_INK_PCT = 0.5;
/** Sample lines per page — keeps healthy ink comfortably above the floor. */
const LINES_PER_PAGE = 10;
/** Rasterization DPI — coverage is a ratio so this only needs to be stable. */
const DPI = 100;

/** public/fonts resolved relative to this script (robust to cwd). */
const fontUrl = (file) => fileURLToPath(new URL(`../public/fonts/${file}`, import.meta.url));

/**
 * The registration contract mirrors src/.../render/pdf/registerFonts.ts exactly,
 * but with absolute filesystem paths (Node's font loader reads from disk, not a
 * web URL). Keep the variant → file mapping in lock-step with registerFonts.ts.
 */
const FAMILIES = [
  {
    family: "Atkinson Hyperlegible",
    fonts: [
      { src: fontUrl("AtkinsonHyperlegible-Regular.ttf"), fontWeight: "normal", fontStyle: "normal" },
      { src: fontUrl("AtkinsonHyperlegible-Bold.ttf"), fontWeight: "bold", fontStyle: "normal" },
      { src: fontUrl("AtkinsonHyperlegible-Italic.ttf"), fontWeight: "normal", fontStyle: "italic" },
      { src: fontUrl("AtkinsonHyperlegible-BoldItalic.ttf"), fontWeight: "bold", fontStyle: "italic" },
    ],
  },
  {
    family: "Lexend",
    fonts: [
      { src: fontUrl("Lexend-Regular.ttf"), fontWeight: "normal", fontStyle: "normal" },
      { src: fontUrl("Lexend-Bold.ttf"), fontWeight: "bold", fontStyle: "normal" },
      { src: fontUrl("Lexend-Regular.ttf"), fontWeight: "normal", fontStyle: "italic" },
      { src: fontUrl("Lexend-Bold.ttf"), fontWeight: "bold", fontStyle: "italic" },
    ],
  },
  {
    family: "OpenDyslexic",
    fonts: [
      { src: fontUrl("OpenDyslexic-Regular.ttf"), fontWeight: "normal", fontStyle: "normal" },
      { src: fontUrl("OpenDyslexic-Bold.ttf"), fontWeight: "bold", fontStyle: "normal" },
      { src: fontUrl("OpenDyslexic-Italic.ttf"), fontWeight: "normal", fontStyle: "italic" },
      { src: fontUrl("OpenDyslexic-Bold.ttf"), fontWeight: "bold", fontStyle: "italic" },
    ],
  },
];

/** Every weight×style combination react-pdf resolves independently. */
const VARIANTS = [
  { fontWeight: "normal", fontStyle: "normal", label: "regular" },
  { fontWeight: "bold", fontStyle: "normal", label: "bold" },
  { fontWeight: "normal", fontStyle: "italic", label: "italic" },
  { fontWeight: "bold", fontStyle: "italic", label: "bold-italic" },
];

/** pt-BR sample exercising every accent, the cedilla (both cases) and the em dash. */
const SAMPLE = "Ãã Õõ Áá Éé Íí Óó Úú Ââ Êê Ôô Àà Çç — coração, ATENÇÃO!";

const fail = (msg) => {
  console.error(`\n❌ pdf-font-smoke: ${msg}`);
  process.exit(1);
};

/** Count dark-pixel coverage (%) of a grayscale P5 PGM buffer. */
function pgmInkPct(buf) {
  // Header: "P5" <ws> <width> <ws> <height> <ws> <maxval> <single-ws> <raster…>
  const tokens = [];
  let i = 0;
  const isWs = (c) => c === 0x20 || c === 0x0a || c === 0x0d || c === 0x09;
  while (tokens.length < 4) {
    while (i < buf.length && isWs(buf[i])) i++;
    const start = i;
    while (i < buf.length && !isWs(buf[i])) i++;
    tokens.push(buf.toString("latin1", start, i));
  }
  i++; // consume the single whitespace after maxval
  const width = Number(tokens[1]);
  const height = Number(tokens[2]);
  let dark = 0;
  for (let p = i; p < buf.length; p++) if (buf[p] < 128) dark++;
  return (100 * dark) / (width * height);
}

async function main() {
  // 0. Pre-flight: every referenced font file must exist.
  const missing = FAMILIES.flatMap((f) => f.fonts.map((v) => v.src)).filter((p) => !existsSync(p));
  if (missing.length) fail(`missing font file(s):\n  ${[...new Set(missing)].join("\n  ")}`);

  // 1. Register the real fonts (throws if a file is not a usable font).
  for (const f of FAMILIES) {
    Font.register({ family: f.family, fonts: f.fonts });
  }

  // 2. Build the document: ONE page per family × variant, with EVERY line on
  //    the page in that single face — so one corrupt file can't hide behind
  //    the healthy faces of its family (per-variant ink measurement).
  const pageSpecs = FAMILIES.flatMap((f) =>
    VARIANTS.map((v) => ({ family: f.family, variant: v, label: `${f.family} ${v.label}` })),
  );
  const doc = h(
    Document,
    null,
    ...pageSpecs.map((spec) =>
      h(
        Page,
        {
          key: spec.label,
          size: "A4",
          style: {
            padding: 40,
            fontSize: 14,
            fontFamily: spec.family,
            fontWeight: spec.variant.fontWeight,
            fontStyle: spec.variant.fontStyle,
          },
        },
        ...Array.from({ length: LINES_PER_PAGE }, (_, i) =>
          h(
            View,
            { key: i, style: { marginBottom: 8 } },
            h(Text, null, `${spec.label} ${i + 1}: ${SAMPLE}`),
          ),
        ),
      ),
    ),
  );

  // 3. Render to a real PDF buffer. A missing/unregistered variant throws here.
  let buf;
  try {
    buf = await renderToBuffer(doc);
  } catch (err) {
    fail(`render threw (variant resolution or subset failure): ${err?.stack ?? err?.message ?? err}`);
  }

  // 4. Structural parse: must be a well-formed PDF.
  if (!buf || buf.length < 1024) fail(`PDF buffer suspiciously small (${buf?.length ?? 0} bytes)`);
  const head = buf.subarray(0, 5).toString("latin1");
  if (head !== "%PDF-") fail(`missing %PDF- header (got ${JSON.stringify(head)})`);
  const tail = buf.subarray(-2048).toString("latin1");
  for (const marker of ["startxref", "%%EOF"]) {
    if (!tail.includes(marker)) fail(`PDF trailer missing "${marker}"`);
  }
  console.log(
    `✓ rendered ${pageSpecs.length} pages (${FAMILIES.length} families × ${VARIANTS.length} variants) → ${buf.length} bytes, valid PDF structure`,
  );

  // 5. Deep check via poppler when available: rasterize and require each
  //    family×variant page to carry real ink. A corrupt/invisible-glyph page
  //    collapses toward 0.
  const probe = spawnSync("pdftoppm", ["-v"], { encoding: "utf8" });
  if (probe.error) {
    console.warn(
      "⚠ pdftoppm (poppler-utils) not found — SKIPPING the rasterization/ink check.\n" +
        "  Structural checks passed, but invisible-glyph corruption is only fully caught\n" +
        "  with poppler. CI installs poppler-utils so this deep check runs there.",
    );
    console.log("\n✅ pdf-font-smoke: PASS (structural only — poppler absent)");
    return;
  }

  const dir = mkdtempSync(join(tmpdir(), "pdf-font-smoke-"));
  try {
    const pdfPath = join(dir, "out.pdf");
    writeFileSync(pdfPath, buf);
    const raster = spawnSync("pdftoppm", ["-gray", "-r", String(DPI), pdfPath, join(dir, "page")], {
      encoding: "utf8",
    });
    if (raster.status !== 0) fail(`pdftoppm exited ${raster.status}:\n${raster.stderr || raster.stdout}`);
    if (raster.stderr && /error/i.test(raster.stderr)) {
      fail(`pdftoppm logged an error (corrupt embedded font):\n${raster.stderr.trim()}`);
    }
    if (raster.stderr && raster.stderr.trim() !== "") {
      console.warn(`⚠ pdftoppm warnings (non-fatal):\n${raster.stderr.trim()}`);
    }

    // Pages come out in document order → map page N to pageSpecs[N].
    const pages = readdirSync(dir)
      .filter((f) => f.endsWith(".pgm"))
      .sort((a, b) => Number(a.match(/-(\d+)\.pgm$/)[1]) - Number(b.match(/-(\d+)\.pgm$/)[1]));
    if (pages.length !== pageSpecs.length) {
      fail(`expected ${pageSpecs.length} rasterized pages, got ${pages.length}`);
    }

    const failures = [];
    pages.forEach((page, idx) => {
      const pct = pgmInkPct(readFileSync(join(dir, page)));
      const label = pageSpecs[idx].label;
      const ok = pct >= MIN_INK_PCT;
      console.log(`  ${ok ? "✓" : "✗"} ${label}: ink ${pct.toFixed(3)}% (floor ${MIN_INK_PCT}%)`);
      if (!ok) failures.push(`${label} rendered ${pct.toFixed(3)}% ink (< ${MIN_INK_PCT}%)`);
    });

    if (failures.length) {
      const fonts = spawnSync("pdffonts", [pdfPath], { encoding: "utf8" });
      fail(
        `page(s) rendered (near-)blank — invisible-glyph / font-corruption regression:\n  ` +
          failures.join("\n  ") +
          `\n--- pdffonts ---\n${fonts.stdout ?? ""}`,
      );
    }
    console.log(`✓ all ${pages.length} family×variant pages carry ink above the floor`);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }

  console.log("\n✅ pdf-font-smoke: PASS (rendered + rasterized, glyphs visible)");
}

main().catch((err) => fail(err?.stack ?? String(err)));
