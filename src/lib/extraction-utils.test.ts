import { describe, it, expect } from "vitest";
import { normalizeTextForDedup, findDuplicates, dataUrlToBlob } from "./extraction-utils";

describe("normalizeTextForDedup", () => {
  it("lowercases text", () => {
    expect(normalizeTextForDedup("QUESTÃO")).toBe("questão");
  });
  it("collapses multiple spaces", () => {
    expect(normalizeTextForDedup("a   b   c")).toBe("a b c");
  });
  it("trims leading/trailing whitespace", () => {
    expect(normalizeTextForDedup("  texto  ")).toBe("texto");
  });
  it("applies NFKC normalization", () => {
    // fi ligature (U+FB01) → "fi"
    expect(normalizeTextForDedup("ﬁ")).toBe("fi");
  });
  it("normalizes newlines/tabs as spaces", () => {
    expect(normalizeTextForDedup("linha1\nlinha2\ttab")).toBe("linha1 linha2 tab");
  });
});

describe("findDuplicates", () => {
  const existing = [
    { text: "Calcule a velocidade" },
    { text: "  Qual é a capital?  " },
  ];

  it("returns empty set when no duplicates", () => {
    const newQ = [{ text: "Uma questão nova" }];
    expect(findDuplicates(newQ, existing).size).toBe(0);
  });

  it("detects exact duplicate (case-insensitive)", () => {
    const newQ = [{ text: "CALCULE A VELOCIDADE" }];
    const dupes = findDuplicates(newQ, existing);
    expect(dupes.has(0)).toBe(true);
  });

  it("detects duplicate ignoring extra whitespace", () => {
    const newQ = [{ text: "  qual é a capital?  " }];
    const dupes = findDuplicates(newQ, existing);
    expect(dupes.has(0)).toBe(true);
  });

  it("returns indices of ALL duplicates", () => {
    const newQ = [
      { text: "Uma questão nova" },
      { text: "Calcule a velocidade" },
      { text: "Outra nova" },
      { text: "Qual é a capital?" },
    ];
    const dupes = findDuplicates(newQ, existing);
    expect(dupes.has(0)).toBe(false);
    expect(dupes.has(1)).toBe(true);
    expect(dupes.has(2)).toBe(false);
    expect(dupes.has(3)).toBe(true);
  });
});

describe("dataUrlToBlob", () => {
  it("converts a PNG data URL to a Blob", () => {
    // minimal 1x1 transparent PNG data URL
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("converts a JPEG data URL to a Blob", () => {
    // same PNG data URL but declared as JPEG — tests MIME mapping, not image validity
    const dataUrl =
      "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/jpeg");
  });
});
