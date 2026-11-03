import { describe, it, expect } from "vitest";

import { findLabelOnlyTrueFalseItems } from "./trueFalseGuard";
import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema";

type Inline = { type: "text"; text: string } | { type: "inlineMath"; latex: string };

function tfQuestion(items: Inline[][]) {
  return {
    type: "question",
    id: "q",
    stem: [{ type: "paragraph", id: "p", content: [{ type: "text", text: "Julgue:" }] }],
    answer: {
      kind: "trueFalse",
      items: items.map((content, i) => ({ id: `i${i}`, content, value: i === 0 })),
    },
  };
}

function result(blocks: unknown[]): AdaptationResult {
  return {
    schemaVersion: 1,
    document: { blocks },
  } as unknown as AdaptationResult;
}

const t = (text: string): Inline => ({ type: "text", text });

describe("findLabelOnlyTrueFalseItems", () => {
  it("flags items that are only the V/F options (bug 0388)", () => {
    const errors = findLabelOnlyTrueFalseItems(
      result([tfQuestion([[t("Verdadeiro")], [t("Falso")]])]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/questão 1/i);
    expect(errors[0]).toMatch(/afirmação/i);
  });

  it.each(["V", "F", " verdadeiro. ", "FALSO", "Verdadeira", "falsa", "( ) V", "(V)", "Certo", "Errado"])(
    "treats %j as a bare label",
    (label) => {
      expect(findLabelOnlyTrueFalseItems(result([tfQuestion([[t(label)]])]))).toHaveLength(1);
    },
  );

  it("accepts real statements, even ones that mention the words", () => {
    const errors = findLabelOnlyTrueFalseItems(
      result([
        tfQuestion([
          [t("3/4 é maior que 2/3")],
          [t("Falso é o contrário de verdadeiro")],
          [{ type: "inlineMath", latex: "0{,}5 = \\frac{1}{2}" }],
          [t("V"), { type: "inlineMath", latex: "x" }],
        ]),
      ]),
    );
    expect(errors).toEqual([]);
  });

  it("numbers questions by document order and ignores other blocks and kinds", () => {
    const errors = findLabelOnlyTrueFalseItems(
      result([
        { type: "paragraph", id: "x", content: [t("Intro")] },
        {
          type: "question",
          id: "o",
          stem: [],
          answer: { kind: "open" },
        },
        tfQuestion([[t("Falso")]]),
      ]),
    );
    expect(errors).toHaveLength(1);
    expect(errors[0]).toMatch(/questão 2/i);
  });
});
