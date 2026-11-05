/**
 * Achado 0707: o vão entre itens de resposta existe só ENTRE itens.
 *
 * As duas telas aplicam `ANSWER_ITEM_GAP_PX` (e `ANSWER_LINE_GAP_PX` na pauta)
 * como `rowGap`, que não deixa sobra depois do último item. O PDF aplicava o
 * mesmo token como `marginBottom` em CADA item, inclusive no último: cada lista
 * terminava com 6pt (18pt na pauta) que a prévia do Exportar não conta. O
 * `@react-pdf/layout` soma o `marginBottom` do último filho na conta de virada
 * de página, então a sobra empurrava a última alternativa sozinha para a folha
 * seguinte mesmo cabendo na página.
 */

import { describe, it, expect } from "vitest";
import type { ReactElement } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { ANSWER_ITEM_GAP_PT, ANSWER_LINE_GAP_PT } from "../pageTokens";
import { PdfAnswer } from "./PdfAnswer";
import { contentChildren } from "@/test/pdfTree";

type Style = { marginBottom?: number };

/** Estilos das linhas (filhos diretos do contêiner) que PdfAnswer devolve. */
function rowStyles(answer: QuestionAnswer): Style[] {
  const node = PdfAnswer({ answer }) as ReactElement;
  const children = contentChildren(node);
  return children.map((c) => (c.props as { style: Style }).style);
}

const ANSWERS: Array<[string, QuestionAnswer]> = [
  [
    "multipleChoice",
    {
      kind: "multipleChoice",
      alternatives: [
        { id: "a1", content: [], correct: true },
        { id: "a2", content: [], correct: false },
        { id: "a3", content: [], correct: false },
      ],
    },
  ],
  [
    "trueFalse",
    {
      kind: "trueFalse",
      items: [
        { id: "t1", content: [], value: true },
        { id: "t2", content: [], value: false },
        { id: "t3", content: [], value: true },
      ],
    },
  ],
  [
    "checkbox",
    {
      kind: "checkbox",
      items: [
        { id: "c1", content: [], checked: false },
        { id: "c2", content: [], checked: false },
        { id: "c3", content: [], checked: false },
      ],
    },
  ],
  [
    "matching",
    {
      kind: "matching",
      pairs: [
        { id: "p1", left: [], right: [] },
        { id: "p2", left: [], right: [] },
        { id: "p3", left: [], right: [] },
      ],
    },
  ],
  [
    "ordering",
    {
      kind: "ordering",
      items: [
        { id: "o1", content: [], position: 0 },
        { id: "o2", content: [], position: 1 },
        { id: "o3", content: [], position: 2 },
      ],
    },
  ],
];

describe("PDF: o vão entre itens não sobra depois do último item (0707)", () => {
  it.each(ANSWERS)("%s: itens anteriores ao último mantêm o vão", (_kind, answer) => {
    const styles = rowStyles(answer);
    expect(styles.slice(0, -1).map((s) => s.marginBottom)).toEqual([
      ANSWER_ITEM_GAP_PT,
      ANSWER_ITEM_GAP_PT,
    ]);
  });

  it.each(ANSWERS)("%s: o último item sai sem marginBottom", (_kind, answer) => {
    const styles = rowStyles(answer);
    expect(styles[styles.length - 1].marginBottom ?? 0).toBe(0);
  });

  it("open: só a última linha da pauta sai sem marginBottom", () => {
    const styles = rowStyles({ kind: "open", answerLines: 3 });
    expect(styles.map((s) => s.marginBottom ?? 0)).toEqual([
      ANSWER_LINE_GAP_PT,
      ANSWER_LINE_GAP_PT,
      0,
    ]);
  });

  it("open com uma linha: a única linha sai sem marginBottom", () => {
    const styles = rowStyles({ kind: "open", answerLines: 1 });
    expect(styles.map((s) => s.marginBottom ?? 0)).toEqual([0]);
  });
});
