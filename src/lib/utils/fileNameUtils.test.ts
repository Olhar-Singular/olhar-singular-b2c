import { describe, it, expect } from "vitest";
import { resolveUniqueFileName } from "./fileNameUtils";

describe("resolveUniqueFileName", () => {
  it("returns original name when no collision", () => {
    const result = resolveUniqueFileName("prova.pdf", ["outro.pdf"]);
    expect(result.finalName).toBe("prova.pdf");
    expect(result.wasRenamed).toBe(false);
  });

  it("appends (1) on first collision", () => {
    const result = resolveUniqueFileName("prova.pdf", ["prova.pdf"]);
    expect(result.finalName).toBe("prova (1).pdf");
    expect(result.wasRenamed).toBe(true);
  });

  it("appends (2) when (1) also collides", () => {
    const result = resolveUniqueFileName("prova.pdf", ["prova.pdf", "prova (1).pdf"]);
    expect(result.finalName).toBe("prova (2).pdf");
    expect(result.wasRenamed).toBe(true);
  });

  it("is case-insensitive", () => {
    const result = resolveUniqueFileName("Prova.PDF", ["prova.pdf"]);
    expect(result.wasRenamed).toBe(true);
  });

  it("handles files without extension", () => {
    const result = resolveUniqueFileName("arquivo", ["arquivo"]);
    expect(result.finalName).toBe("arquivo (1)");
    expect(result.wasRenamed).toBe(true);
  });

  it("handles empty existing list", () => {
    const result = resolveUniqueFileName("novo.pdf", []);
    expect(result.finalName).toBe("novo.pdf");
    expect(result.wasRenamed).toBe(false);
  });
});
