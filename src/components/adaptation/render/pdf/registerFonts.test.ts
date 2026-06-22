import { describe, it, expect, vi, beforeEach } from "vitest";

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
    const fonts = lexendCalls[0][0].fonts as { src: string }[];
    const srcs = fonts.map((f) => f.src);
    expect(srcs.some((s) => s.includes("Lexend-Regular"))).toBe(true);
    expect(srcs.some((s) => s.includes("Lexend-Bold"))).toBe(true);
  });

  it("registers the correct src paths for OpenDyslexic variants", async () => {
    const { registerPdfFonts } = await import("./registerFonts");
    registerPdfFonts();

    const odCalls = mockRegister.mock.calls.filter((c) => c[0].family === "OpenDyslexic");
    expect(odCalls.length).toBe(1);
    const fonts = odCalls[0][0].fonts as { src: string }[];
    const srcs = fonts.map((f) => f.src);
    expect(srcs.some((s) => s.includes("OpenDyslexic-Regular"))).toBe(true);
    expect(srcs.some((s) => s.includes("OpenDyslexic-Bold"))).toBe(true);
    expect(srcs.some((s) => s.includes("OpenDyslexic-Italic"))).toBe(true);
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
