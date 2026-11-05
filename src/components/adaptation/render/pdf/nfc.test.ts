import { describe, it, expect } from "vitest";
import { normalizeNfc } from "./nfc";

describe("normalizeNfc: acento decomposto vira o caractere composto (B1)", () => {
  const decomposed = "é ã ç"; // é ã ç como o macOS cola
  const composed = "é ã ç";

  it("string", () => {
    expect(normalizeNfc(decomposed)).toBe(composed);
  });

  it("percorre objetos e listas, sem tocar no que não é string", () => {
    const input = {
      id: "00000000-0000-4000-8000-000000000001",
      blocks: [{ text: decomposed, n: 3, ok: true, none: null, nested: { latex: decomposed } }],
    };
    expect(normalizeNfc(input)).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      blocks: [{ text: composed, n: 3, ok: true, none: null, nested: { latex: composed } }],
    });
  });

  it("devolve a MESMA referência quando nada muda (não refaz o documento à toa)", () => {
    const input = { a: ["texto", { b: "já composto é" }] };
    expect(normalizeNfc(input)).toBe(input);
  });

  it("não altera o original", () => {
    const input = { text: decomposed };
    normalizeNfc(input);
    expect(input.text).toBe(decomposed);
  });

  it("undefined passa", () => {
    expect(normalizeNfc(undefined)).toBeUndefined();
  });
});
