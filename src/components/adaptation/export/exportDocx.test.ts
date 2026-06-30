import { describe, it, expect } from "vitest";
import { docxFileName } from "./exportDocx";

describe("docxFileName", () => {
  it("retorna nome padrão quando o cabeçalho não tem título", () => {
    expect(docxFileName({})).toBe("atividade-adaptada.docx");
  });

  it("slugifica o título e adiciona .docx", () => {
    expect(docxFileName({ title: "Minha Prova Final" })).toBe("minha-prova-final.docx");
  });

  it("remove acentos do título", () => {
    expect(docxFileName({ title: "Atividade de Matemática" })).toBe("atividade-de-matematica.docx");
  });

  it("retorna nome padrão quando o título é só espaços", () => {
    expect(docxFileName({ title: "   " })).toBe("atividade-adaptada.docx");
  });
});
