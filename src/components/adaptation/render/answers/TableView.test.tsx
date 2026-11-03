import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { TableView } from "./TableView";
import { RULE_COLOR } from "../pageTokens";

const t = (text: string) => [{ type: "text" as const, text }];

describe("TableView", () => {
  // Achado 0522: a borda vinha de `border-border`, token do chrome do app
  // (1,33:1 sobre o papel); a prévia do Exportar usa a régua do documento,
  // a mesma tinta do PDF e do Word.
  it("paints every cell border with the document rule color", () => {
    const answer = {
      kind: "table",
      rows: [
        [t("Animal"), t("Som")],
        [t("gato"), t("mia")],
      ],
    } as Extract<QuestionAnswer, { kind: "table" }>;
    render(<TableView answer={answer} />);
    const cells = screen.getByTestId("answer-table").querySelectorAll("th, td");
    expect(cells).toHaveLength(4);
    for (const cell of cells) expect(cell).toHaveStyle({ borderColor: RULE_COLOR });
  });
});
