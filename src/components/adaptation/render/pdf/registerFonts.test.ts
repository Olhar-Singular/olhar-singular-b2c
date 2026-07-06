import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { FONT_FAMILY_TOKENS, fontFamilyToPdf } from "@/lib/adaptation/canonical/fontFamily";

// Mock @react-pdf/renderer before importing registerFonts
const mockRegister = vi.fn();
vi.mock("@react-pdf/renderer", () => ({
  Font: { register: mockRegister },
}));

// We import dynamically inside each test so we can reset module state between runs.
// The idempotency test requires resetting the module-level `done` guard.

describe("registerPdfFonts", () => {
  beforeEach(() => {
    mockRegister.mockClear();
    // Reset module registry so the `done` guard is cleared between tests.
    vi.resetModules();
  });

  it("calls Font.register for each a11y family (Atkinson Hyperlegible, Lexend, OpenDyslexic)", async () => {
    const { registerPdfFonts } = await import("./registerFonts");
    registerPdfFonts();

    const families = mockRegister.mock.calls.map((c) => c[0].family as string);
    expect(families).toContain("Atkinson Hyperlegible");
    expect(families).toContain("Lexend");
    expect(families).toContain("OpenDyslexic");
  });

  it("registers the correct src paths for Atkinson Hyperlegible variants", async () => {
    const { registerPdfFonts } = await import("./registerFonts");
    registerPdfFonts();

    // Font.register is called once per family with a `fonts` array of variants.
    const atkinsonCalls = mockRegister.mock.calls.filter((c) => c[0].family === "Atkinson Hyperlegible");
    expect(atkinsonCalls.length).toBe(1);
    const fonts = atkinsonCalls[0][0].fonts as { src: string; fontWeight?: string; fontStyle?: string }[];
    const srcs = fonts.map((f) => f.src);
    expect(srcs.some((s) => s.includes("AtkinsonHyperlegible-Regular"))).toBe(true);
    expect(srcs.some((s) => s.includes("AtkinsonHyperlegible-Bold"))).toBe(true);
    expect(srcs.some((s) => s.includes("AtkinsonHyperlegible-Italic"))).toBe(true);
    expect(srcs.some((s) => s.includes("AtkinsonHyperlegible-BoldItalic"))).toBe(true);
  });

  it("registers the correct src paths for Lexend variants", async () => {
    const { registerPdfFonts } = await import("./registerFonts");
    registerPdfFonts();

    const lexendCalls = mockRegister.mock.calls.filter((c) => c[0].family === "Lexend");
    expect(lexendCalls.length).toBe(1);
    const fonts = lexendCalls[0][0].fonts as { src: string; fontWeight?: string; fontStyle?: string }[];
    const variant = (weight: string, style: string) =>
      fonts.find((f) => f.fontWeight === weight && f.fontStyle === style);

    expect(variant("normal", "normal")?.src).toContain("Lexend-Regular");
    expect(variant("bold", "normal")?.src).toContain("Lexend-Bold");
    // No italic files ship for Lexend — react-pdf does NOT fall back across
    // variants ("Could not resolve font"), so italics map to the upright files.
    expect(variant("normal", "italic")?.src).toContain("Lexend-Regular");
    expect(variant("bold", "italic")?.src).toContain("Lexend-Bold");
  });

  it("registers the correct src paths for OpenDyslexic variants", async () => {
    const { registerPdfFonts } = await import("./registerFonts");
    registerPdfFonts();

    const odCalls = mockRegister.mock.calls.filter((c) => c[0].family === "OpenDyslexic");
    expect(odCalls.length).toBe(1);
    const fonts = odCalls[0][0].fonts as { src: string; fontWeight?: string; fontStyle?: string }[];
    const variant = (weight: string, style: string) =>
      fonts.find((f) => f.fontWeight === weight && f.fontStyle === style);

    expect(variant("normal", "normal")?.src).toContain("OpenDyslexic-Regular");
    expect(variant("bold", "normal")?.src).toContain("OpenDyslexic-Bold");
    expect(variant("normal", "italic")?.src).toContain("OpenDyslexic-Italic");
    // No BoldItalic file ships — map bold+italic to the Bold file so react-pdf
    // can resolve it instead of throwing.
    expect(variant("bold", "italic")?.src).toContain("OpenDyslexic-Bold");
  });

  it("is idempotent — calling twice does NOT call Font.register a second time", async () => {
    const { registerPdfFonts } = await import("./registerFonts");
    registerPdfFonts();
    const callsAfterFirst = mockRegister.mock.calls.length;
    expect(callsAfterFirst).toBeGreaterThan(0); // guard: first call registered something

    registerPdfFonts(); // second call — the `done` guard must prevent any new register calls
    expect(mockRegister.mock.calls.length).toBe(callsAfterFirst); // no new calls
  });
});

/**
 * Contract test: fontFamily.ts (PDF_FAMILIES) ↔ registerFonts.ts.
 *
 * The tests above pin the *hardcoded* variants. This block instead derives the
 * set of PDF families straight from the single source of truth in fontFamily.ts
 * — `FONT_FAMILY_TOKENS.map(fontFamilyToPdf)` yields exactly the values of the
 * internal `PDF_FAMILIES` record — and asserts, for every NON-builtin family:
 *
 *   1. it is actually Font.register'd, and
 *   2. all four fontWeight(normal/bold) × fontStyle(normal/italic) combinations
 *      are registered, and
 *   3. every registered `src` resolves to a real file under `public/`.
 *
 * Why this matters: react-pdf does NOT fall back across variants. An unregistered
 * weight/style (or a src pointing at a missing file) throws "Could not resolve
 * font" and aborts the whole export. Deriving the family list from fontFamily.ts
 * means adding a new accessibility token there without wiring its 4 variants +
 * files here fails this test — the two files can never silently diverge.
 */
describe("registerPdfFonts ↔ PDF_FAMILIES contract (variant + asset coverage)", () => {
  /** @react-pdf built-ins: no Font.register, no shipped file. */
  const BUILTINS = new Set(["Helvetica", "Times-Roman", "Courier"]);

  /** The 4 combinations react-pdf resolves independently (no cross-variant fallback). */
  const REQUIRED_VARIANTS = [
    { fontWeight: "normal", fontStyle: "normal" },
    { fontWeight: "bold", fontStyle: "normal" },
    { fontWeight: "normal", fontStyle: "italic" },
    { fontWeight: "bold", fontStyle: "italic" },
  ];

  const PUBLIC_DIR = join(process.cwd(), "public");

  /** Every non-builtin PDF family fontFamily.ts can emit for a logical token. */
  const registrableFamilies = [...new Set(FONT_FAMILY_TOKENS.map((t) => fontFamilyToPdf(t)))].filter(
    (family) => !BUILTINS.has(family),
  );

  beforeEach(() => {
    mockRegister.mockClear();
    vi.resetModules();
  });

  /** Run registration fresh and index the registered `fonts` arrays by family. */
  async function registrationsByFamily() {
    const { registerPdfFonts } = await import("./registerFonts");
    registerPdfFonts();
    const byFamily = new Map<string, { src: string; fontWeight?: string; fontStyle?: string }[]>();
    for (const call of mockRegister.mock.calls) {
      byFamily.set(call[0].family as string, call[0].fonts);
    }
    return byFamily;
  }

  it("Font.register's every non-builtin family that fontFamilyToPdf can emit", async () => {
    const byFamily = await registrationsByFamily();
    // Guard: the accessibility families must actually exist (no vacuous pass).
    expect(registrableFamilies).toEqual(
      expect.arrayContaining(["Atkinson Hyperlegible", "Lexend", "OpenDyslexic"]),
    );
    for (const family of registrableFamilies) {
      expect(
        byFamily.has(family),
        `family "${family}" is emitted by fontFamilyToPdf but never Font.register'd`,
      ).toBe(true);
    }
  });

  it.each(registrableFamilies)(
    "%s registers all 4 fontWeight×fontStyle variants (react-pdf has no variant fallback)",
    async (family) => {
      const fonts = (await registrationsByFamily()).get(family) ?? [];
      for (const v of REQUIRED_VARIANTS) {
        const match = fonts.find(
          (f) => (f.fontWeight ?? "normal") === v.fontWeight && (f.fontStyle ?? "normal") === v.fontStyle,
        );
        expect(
          match,
          `${family}: missing variant weight=${v.fontWeight} style=${v.fontStyle} → export throws "Could not resolve font"`,
        ).toBeTruthy();
      }
    },
  );

  it.each(registrableFamilies)("%s: every registered src points to a real file under public/", async (family) => {
    const fonts = (await registrationsByFamily()).get(family) ?? [];
    expect(fonts.length).toBeGreaterThan(0);
    for (const f of fonts) {
      // src is a web-absolute path like "/fonts/OpenDyslexic-Regular.ttf".
      const rel = f.src.replace(/^\//, "");
      expect(existsSync(join(PUBLIC_DIR, rel)), `${family}: src "${f.src}" has no file at public/${rel}`).toBe(true);
    }
  });
});
