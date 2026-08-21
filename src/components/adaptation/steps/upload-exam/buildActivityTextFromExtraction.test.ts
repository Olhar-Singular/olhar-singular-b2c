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
});
