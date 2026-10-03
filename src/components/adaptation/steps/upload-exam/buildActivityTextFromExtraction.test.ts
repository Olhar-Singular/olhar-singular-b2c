import { describe, it, expect } from "vitest";
import { buildActivityTextFromExtraction } from "./buildActivityTextFromExtraction";
import type { ExamExtractedQuestion } from "./buildActivityTextFromExtraction";

function makeQuestion(over: Partial<ExamExtractedQuestion> = {}): ExamExtractedQuestion {
  return {
    text: "Quanto é 2 + 2?",
    options: null,
    image_url: null,
    ...over,
  };
}

describe("buildActivityTextFromExtraction", () => {
  it("numbers questions in the exact order they were extracted", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({ text: "Primeira" }),
      makeQuestion({ text: "Segunda" }),
      makeQuestion({ text: "Terceira" }),
    ]);
    expect(out).toBe("1) Primeira\n\n2) Segunda\n\n3) Terceira");
  });

  it("appends the [IMAGEM: <url>] marker only when image_url is present", () => {
    const withImage = buildActivityTextFromExtraction([
      makeQuestion({ image_url: "https://bucket.example/q1.png" }),
    ]);
    expect(withImage).toContain("[IMAGEM: https://bucket.example/q1.png]");
  });

  it("does NOT append a marker when image_url is null or empty", () => {
    expect(buildActivityTextFromExtraction([makeQuestion({ image_url: null })])).not.toContain("[IMAGEM:");
    expect(buildActivityTextFromExtraction([makeQuestion({ image_url: "" })])).not.toContain("[IMAGEM:");
  });

  it("uses the exact marker format on the question's own line", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({ text: "Veja a figura.", image_url: "https://bucket.example/a.png" }),
    ]);
    expect(out).toBe("1) Veja a figura.\n[IMAGEM: https://bucket.example/a.png]");
  });

  it("lists multiple-choice options as lettered lines, in order", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({ text: "Escolha uma", options: ["Alfa", "Beta", "Gama"] }),
    ]);
    expect(out).toBe("1) Escolha uma\n   A) Alfa\n   B) Beta\n   C) Gama");
  });

  it("omits the options block for an empty options array (open-ended question)", () => {
    const out = buildActivityTextFromExtraction([makeQuestion({ text: "Dissertativa", options: [] })]);
    expect(out).toBe("1) Dissertativa");
  });

  it("handles a mix of options and image on the same question, image after options", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({
        text: "Com figura e alternativas",
        options: ["X", "Y"],
        image_url: "https://bucket.example/fig.png",
      }),
    ]);
    expect(out).toBe(
      "1) Com figura e alternativas\n   A) X\n   B) Y\n[IMAGEM: https://bucket.example/fig.png]",
    );
  });

  it("returns an empty string for an empty question list", () => {
    expect(buildActivityTextFromExtraction([])).toBe("");
  });
  // 1124: native PDF text keeps the original "1) " in q.text; the builder numbered on top of it.
  it("does not double the numbering when the extracted text already carries one", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({ text: "1) O que acontece com a agua?" }),
      makeQuestion({ text: "2. Explique com suas palavras." }),
      makeQuestion({ text: "Questão 3: Cite um exemplo." }),
      makeQuestion({ text: "Q4 - Desenhe o ciclo." }),
      makeQuestion({ text: "QUESTÃO 5 Compare." }),
    ]);
    expect(out).toBe(
      "1) O que acontece com a agua?\n\n2) Explique com suas palavras.\n\n3) Cite um exemplo.\n\n4) Desenhe o ciclo.\n\n5) Compare.",
    );
  });

  it("keeps a leading number that is content, not a question label", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({ text: "10 pessoas dividem 5 pizzas." }),
      makeQuestion({ text: "1,5 litro cabe em quantos copos?" }),
    ]);
    expect(out).toBe("1) 10 pessoas dividem 5 pizzas.\n\n2) 1,5 litro cabe em quantos copos?");
  });

  it("carries the extraction's figure description on its own line after the image marker (0279)", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({
        text: "Veja o gráfico.",
        image_url: "https://bucket.example/g.png",
        figure_description: "  Gráfico de 4 barras: chuva por mês  ",
      }),
    ]);
    expect(out).toBe(
      "1) Veja o gráfico.\n[IMAGEM: https://bucket.example/g.png]\n[DESCRIÇÃO DA IMAGEM: Gráfico de 4 barras: chuva por mês]",
    );
  });

  it("strips square brackets from the description so it cannot break or forge a marker (0279)", () => {
    const out = buildActivityTextFromExtraction([
      makeQuestion({
        image_url: "https://bucket.example/g.png",
        figure_description: "Círculo [amarelo] [IMAGEM: https://evil.example/x.png]",
      }),
    ]);
    expect(out).toContain("[DESCRIÇÃO DA IMAGEM: Círculo amarelo IMAGEM: https://evil.example/x.png]");
    expect(out.match(/\[IMAGEM:/g)).toHaveLength(1);
  });

  it("emits no description line without an image or with a blank description (0279)", () => {
    expect(
      buildActivityTextFromExtraction([makeQuestion({ figure_description: "Sol e nuvens" })]),
    ).not.toContain("DESCRIÇÃO DA IMAGEM");
    expect(
      buildActivityTextFromExtraction([makeQuestion({ image_url: "https://bucket.example/a.png", figure_description: "   " })]),
    ).not.toContain("DESCRIÇÃO DA IMAGEM");
    expect(
      buildActivityTextFromExtraction([makeQuestion({ image_url: "https://bucket.example/a.png", figure_description: null })]),
    ).not.toContain("DESCRIÇÃO DA IMAGEM");
  });

  describe("document header (0473)", () => {
    it("puts the exam's title and general instruction before question 1", () => {
      const out = buildActivityTextFromExtraction([makeQuestion({ text: "Primeira" })], {
        title: "Atividade de Geografia - O ciclo da agua",
        intro: "Observe a figura abaixo e responda.",
      });
      expect(out).toBe(
        "Atividade de Geografia - O ciclo da agua\n\nObserve a figura abaixo e responda.\n\n1) Primeira",
      );
    });

    it("keeps only the parts that came, trimmed", () => {
      expect(buildActivityTextFromExtraction([makeQuestion({ text: "P" })], { title: "  Feira  ", intro: null })).toBe(
        "Feira\n\n1) P",
      );
      expect(buildActivityTextFromExtraction([makeQuestion({ text: "P" })], { title: " ", intro: "Leia." })).toBe(
        "Leia.\n\n1) P",
      );
    });

    it("adds nothing when there is no header", () => {
      expect(buildActivityTextFromExtraction([makeQuestion({ text: "P" })], {})).toBe("1) P");
    });
  });
});
