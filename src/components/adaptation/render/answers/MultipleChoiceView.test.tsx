import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { MultipleChoiceView } from "./MultipleChoiceView";
import { ALTERNATIVE_MARKER_CLASS } from "./markerColumn";

const t = (text: string) => [{ type: "text" as const, text }];

const answer = {
  kind: "multipleChoice",
  alternatives: [
    { id: "11111111-1111-4111-8111-111111111111", content: t("um"), correct: true },
    { id: "22222222-2222-4222-8222-222222222222", content: t("dois"), correct: false },
    { id: "33333333-3333-4333-8333-333333333333", content: t("tres"), correct: false },
  ],
} satisfies QuestionAnswer as Extract<QuestionAnswer, { kind: "multipleChoice" }>;

describe("MultipleChoiceView", () => {
  it("renders one lettered alternative per line, without the answer key", () => {
    render(<MultipleChoiceView answer={answer} />);
    const items = screen.getAllByRole("listitem");
    expect(items.map((li) => li.textContent)).toEqual(["a)um", "b)dois", "c)tres"]);
    expect(screen.queryByTestId("correct-marker")).toBeNull();
  });

  // Achado 0202: sem coluna de largura fixa cada letra ocupa a largura natural do
  // glifo, o texto de cada alternativa começa num x diferente e a margem esquerda
  // serrilha. O PDF já resolve isso com `width: 22` (PdfAnswer MARKER).
  it("puts the letter marker in a fixed-width column, mirroring the PDF", () => {
    render(<MultipleChoiceView answer={answer} />);
    const markers = screen.getAllByTestId("alternative-marker");
    expect(markers).toHaveLength(3);
    markers.forEach((marker) => {
      expect(marker.className).toContain(ALTERNATIVE_MARKER_CLASS);
    });
    // a largura é declarada em em, então acompanha o token de fonte da folha
    expect(ALTERNATIVE_MARKER_CLASS).toMatch(/\bw-\[[\d.]+em\]/);
  });
});
