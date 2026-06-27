import { describe, it, expect } from "vitest";
import { normalizeSubject } from "./constants";

describe("normalizeSubject", () => {
  it("returns exact SUBJECTS values unchanged", () => {
    expect(normalizeSubject("Português")).toBe("Português");
    expect(normalizeSubject("Física")).toBe("Física");
    expect(normalizeSubject("Ed. Física")).toBe("Ed. Física");
    expect(normalizeSubject("Geral")).toBe("Geral");
  });

  it("maps 'Língua Portuguesa' to 'Português'", () => {
    expect(normalizeSubject("Língua Portuguesa")).toBe("Português");
    expect(normalizeSubject("língua portuguesa")).toBe("Português");
    expect(normalizeSubject("Lingua Portuguesa")).toBe("Português");
  });

  it("maps 'Língua Inglesa' to 'Inglês'", () => {
    expect(normalizeSubject("Língua Inglesa")).toBe("Inglês");
    expect(normalizeSubject("língua inglesa")).toBe("Inglês");
  });

  it("maps 'Educação Física' to 'Ed. Física'", () => {
    expect(normalizeSubject("Educação Física")).toBe("Ed. Física");
    expect(normalizeSubject("educação física")).toBe("Ed. Física");
    expect(normalizeSubject("Educacao Fisica")).toBe("Ed. Física");
  });

  it("maps 'Artes' to 'Arte'", () => {
    expect(normalizeSubject("Artes")).toBe("Arte");
    expect(normalizeSubject("artes")).toBe("Arte");
  });

  it("maps 'Ciências da Natureza' to 'Ciências'", () => {
    expect(normalizeSubject("Ciências da Natureza")).toBe("Ciências");
    expect(normalizeSubject("ciencias da natureza")).toBe("Ciências");
  });

  it("is case-insensitive for exact SUBJECTS matches", () => {
    expect(normalizeSubject("física")).toBe("Física");
    expect(normalizeSubject("MATEMÁTICA")).toBe("Matemática");
    expect(normalizeSubject("geografia")).toBe("Geografia");
  });

  it("falls back to 'Geral' for unknown subjects", () => {
    expect(normalizeSubject("Filosofia")).toBe("Geral");
    expect(normalizeSubject("Sociologia")).toBe("Geral");
    expect(normalizeSubject("")).toBe("Geral");
    expect(normalizeSubject("   ")).toBe("Geral");
  });
});
