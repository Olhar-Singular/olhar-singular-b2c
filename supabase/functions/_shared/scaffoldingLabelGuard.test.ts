import { describe, it, expect } from "vitest";
import { stripScaffoldingLabels, stripScaffoldingLabel } from "./scaffoldingLabelGuard.ts";
import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";

describe("stripScaffoldingLabel (C-20)", () => {
  it.each([
    ["Passo 1: Sublinhe os números.", "Sublinhe os números."],
    ["Passo 2 - Escolha a operação.", "Escolha a operação."],
    ["passo 3. Calcule.", "Calcule."],
    ["Etapa 4) Confira.", "Confira."],
    ["ETAPA 5 – Escreva a resposta.", "Escreva a resposta."],
    ["1. Leia o enunciado.", "Leia o enunciado."],
    ["2) Some os valores.", "Some os valores."],
    ["  Passo 10: dez passos.", "Dez passos."],
    ["Passo 1: leia.", "Leia."],
  ])("%s -> %s", (input, expected) => {
    expect(stripScaffoldingLabel(input)).toBe(expected);
  });

  // F6-2: math at the start of the item is not a sentence; the label goes, the case stays.
  it.each([
    ["Passo 1: x + 3 = 10", "x + 3 = 10"],
    ["Passo 2 - n é o número de lados", "n é o número de lados"],
    ["1. x = 5, então 2x = 10", "x = 5, então 2x = 10"],
    ["Passo 1: π vale 3,14", "π vale 3,14"],
    ["Etapa 3: cm² é a unidade de área", "cm² é a unidade de área"],
    ["Passo 1: cm é a unidade", "cm é a unidade"],
    ["Passo 2: sen θ = 3/5", "sen θ = 3/5"],
    ["Passo 4: mmc de 4 e 6", "mmc de 4 e 6"],
    ["Passo 1: ab = 12", "ab = 12"],
    ["Passo 1: fatore 12", "Fatore 12"],
    ["Passo 1: à direita fica o 3", "À direita fica o 3"],
  ])("%s -> %s (keeps math as written)", (input, expected) => {
    expect(stripScaffoldingLabel(input)).toBe(expected);
  });

  it.each([
    "Sublinhe o passo 1 da receita.",
    "Passo a passo: some os valores.",
    "Passo 1",
    "Etapa 2:",
    "3,5 vezes o valor.",
    "10.000 pessoas foram.",
    "2 . 3 = 6 é um produto.",
    "1.5 cm é o lado.",
    "5 pães por dia.",
    "Passos 1 e 2: leia.",
    "",
  ])("keeps %j as it is", (input) => {
    expect(stripScaffoldingLabel(input)).toBe(input);
  });

  it("does not cut content: only the label goes", () => {
    expect(stripScaffoldingLabel("Passo 2: Calcule 12 + 3 = 15.")).toBe("Calcule 12 + 3 = 15.");
  });
});

const result = (blocks: unknown[]): AdaptationResult =>
  ({ document: { schemaVersion: 1, blocks }, strategies_applied: [], pedagogical_justification: "x", implementation_tips: [] }) as unknown as AdaptationResult;

describe("stripScaffoldingLabels", () => {
  it("cleans the support items inside a question's stem and at the top level", () => {
    const out = stripScaffoldingLabels(
      result([
        { type: "scaffolding", items: ["Passo 1: Leia."] },
        {
          type: "question",
          stem: [{ type: "paragraph", content: [{ type: "text", text: "Passo 1: não mexe no enunciado" }] }, { type: "scaffolding", items: ["Passo 1: Sublinhe.", "Passo 2: Calcule."] }],
          answer: { kind: "open" },
        },
      ]),
    );
    const blocks = out.document.blocks as unknown as Array<{ items?: string[]; stem?: Array<{ items?: string[]; content?: Array<{ text: string }> }> }>;
    expect(blocks[0].items).toEqual(["Leia."]);
    expect(blocks[1].stem![0].content![0].text).toBe("Passo 1: não mexe no enunciado");
    expect(blocks[1].stem![1].items).toEqual(["Sublinhe.", "Calcule."]);
  });

  it("returns the same object when there is nothing to clean", () => {
    const r = result([{ type: "question", stem: [{ type: "scaffolding", items: ["Leia."] }], answer: { kind: "open" } }]);
    expect(stripScaffoldingLabels(r)).toBe(r);
  });

  it("ignores blocks and items it does not understand", () => {
    const r = result([null, { type: "question" }, { type: "question", stem: "x" }, { type: "scaffolding", items: [3, "Passo 1: a"] }]);
    const out = stripScaffoldingLabels(r);
    expect((out.document.blocks as unknown as Array<{ items?: unknown[] }>)[3].items).toEqual([3, "A"]);
  });
});
