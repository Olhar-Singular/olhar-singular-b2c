/**
 * Fórmula inline não leva hífen no meio (C-15).
 *
 * `latexLayoutAtom` costura a fórmula num único token com espaço inquebrável. Acima
 * de 30 caracteres o `hyphenateWord` a cortava em pedaços de 8 e o textkit, ao
 * quebrar a linha num desses pedaços, desenhava um "-" no fim: `(x + y) \cdot (x-`
 * numa linha e `+ y)` na seguinte. Roda o layout REAL e lê o texto de cada linha.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

type Line = { string?: string };
type Node = { lines?: Line[]; children?: Node[] };

function lineTexts(node: Node, out: string[] = []): string[] {
  for (const line of node.lines ?? []) out.push(line.string ?? "");
  for (const child of node.children ?? []) lineTexts(child, out);
  return out;
}

async function printedLines(latex: string, lead: string): Promise<string[]> {
  const doc: CanonicalDocument = {
    schemaVersion: 1,
    blocks: [
      {
        id: id(1),
        type: "paragraph",
        content: [
          { type: "text", text: lead },
          { type: "inlineMath", latex },
          { type: "text", text: " e confira." },
        ],
      },
    ],
  };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  const tree = (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
  return lineTexts(tree);
}

const NBSP = /\u00a0/g;
const FORMULA = String.raw`(x + y) \cdot (x - y) = x^2 - y^2`;

describe("fórmula inline no PDF não é partida por hífen (C-15)", () => {
  // Várias distâncias até a margem: em alguma a fórmula não cabe no resto da linha.
  for (const lead of ["", "Calcule ".repeat(7), "Calcule ".repeat(9), "Calcule ".repeat(11)]) {
    it(`mantém a fórmula inteira numa linha (abertura de ${lead.length} caracteres)`, async () => {
      const lines = (await printedLines(FORMULA, lead)).map((l) => l.replace(NBSP, " "));
      expect(lines.some((l) => /[A-Za-z0-9]-$/.test(l))).toBe(false);
      expect(lines.filter((l) => l.includes(FORMULA)).length).toBe(1);
    });
  }
});
