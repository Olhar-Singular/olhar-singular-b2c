import { describe, it, expect } from "vitest";
import { buildActivityText } from "./buildActivityText";
import type { SelectedQuestion } from "@/lib/adaptation/wizard/wizardState";

function makeQuestion(over: Partial<SelectedQuestion> = {}): SelectedQuestion {
  return {
    id: "q1",
    text: "Quanto é 2 + 2?",
    image_url: null,
    options: null,
    subject: "Matemática",
    topic: null,
    difficulty: null,
    ...over,
  };
}

describe("buildActivityText", () => {
  it("appends the [IMAGEM: <url>] marker only when image_url is present", () => {
    const withImage = buildActivityText([
      makeQuestion({ image_url: "https://bucket.example/q1.png" }),
    ]);
    expect(withImage).toContain("[IMAGEM: https://bucket.example/q1.png]");
  });

  it("does NOT append a marker when image_url is null or empty", () => {
    expect(buildActivityText([makeQuestion({ image_url: null })])).not.toContain("[IMAGEM:");
    expect(buildActivityText([makeQuestion({ image_url: "" })])).not.toContain("[IMAGEM:");
  });

  it("uses the exact marker format on the question's own line", () => {
    const out = buildActivityText([
      makeQuestion({ text: "Veja a figura.", image_url: "https://bucket.example/a.png" }),
    ]);
    expect(out).toBe("1) Veja a figura.\n[IMAGEM: https://bucket.example/a.png]");
  });

  it("handles multiple questions, marking only those with an image", () => {
    const out = buildActivityText([
      makeQuestion({ id: "a", text: "Primeira", image_url: "https://bucket.example/1.png" }),
      makeQuestion({ id: "b", text: "Segunda", options: ["X", "Y"], image_url: null }),
    ]);
    expect(out).toBe(
      "1) Primeira\n[IMAGEM: https://bucket.example/1.png]\n\n2) Segunda\n   A) X\n   B) Y",
    );
  });
});
