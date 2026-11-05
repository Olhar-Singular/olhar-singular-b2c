/**
 * Fórmula inline que não cabe na coluna do pareamento, da célula, da alternativa… (N-M-001, N-U-001).
 *
 * O C-15 deixou a fórmula costurada num único átomo até a largura da FOLHA (50 caracteres); numa
 * coluna mais estreita o átomo passava da caixa e o papel o cortava ou o punha por cima da coluna
 * vizinha, e sem espaço (`1+2+...+80`) o textkit hifenava no meio do token. Roda o layout REAL,
 * com as 23 fórmulas da IA que cortavam na bateria, e confere em cada caixa de texto: nenhum
 * caractere perdido nem acrescentado (hífen), e cada linha cabe na largura REAL da caixa.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import type { Block, CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

const id = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
})();

type Line = { string?: string; runs?: Array<{ positions?: Array<{ xAdvance?: number }> }> };
type Node = { type?: string; box?: { width?: number }; lines?: Line[]; children?: Node[] };

function textNodes(node: Node, out: Node[] = []): Node[] {
  if (node.lines?.length) out.push(node);
  for (const child of node.children ?? []) textNodes(child, out);
  return out;
}

async function layout(blocks: Block[]): Promise<Node[]> {
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  const tree = (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
  return textNodes(tree);
}

const FORMULAS: Array<[string, string]> = [
  ["IA001", String.raw`\begin{cases} x + y = 10 \\ x - y = 2 \end{cases}`],
  ["IA012", String.raw`\begin{cases} x+y=5 \\ x-y=1 \end{cases}`],
  ["IA035", String.raw`A = \pi r`],
  ["IA037", String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`],
  ["IA038", String.raw`x = \frac{-b \pm \sqrt{b^2 + 4ac}}{2a}`],
  ["IA039", String.raw`x = \frac{b \pm \sqrt{b^2 - 4ac}}{2a}`],
  ["IA040", String.raw`x = \frac{-b \pm \sqrt{b^2 - 4ac}}{a}`],
  ["IA048", String.raw`C = \begin{vmatrix} 2 & 3 \\ 1 & 4 \end{vmatrix}`],
  ["IA053", String.raw`a_n = a_1 + (n-1) \cdot r`],
  ["IA054", String.raw`S_n = \frac{(a_1 + a_n) \cdot n}{2}`],
  ["IA076", String.raw`2 \times 2 \times 2 \times 2 \times 2 = ?`],
  ["IA092", String.raw`C = \begin{pmatrix} 2 & 3 \\ 1 & 4 \end{pmatrix}`],
  ["IA095", String.raw`a_n = a_1 + (n - 1) \cdot r`],
  ["IA096", String.raw`a_n = a_1 \cdot q^{(n - 1)}`],
  ["IA099", String.raw`C(n,p) = \frac{n!}{p! \cdot (n-p)!}`],
  ["IA100", String.raw`C(8,3)`],
  ["IA108", String.raw`(x + y) \cdot (x + y) \cdot (x + y)`],
  ["IA129", String.raw`\frac{1}{2} + \frac{1}{3} = \frac{2}{5}`],
  ["IA162", String.raw`\sin(30^{\circ}) + \cos(60^{\circ})`],
  ["IA169", String.raw`\sin(30^{\circ}) = \frac{1}{2}`],
  ["IA170", String.raw`\cos(60^{\circ}) = \frac{1}{2}`],
  ["IA182", String.raw`hipotenusa^2 = cateto^2 + cateto^2`],
  ["IA190", String.raw`2 \times 2 \times 2 \times 2 \times 2`],
  ["SUM80", String.raw`1+2+3+4+5+6+7+8+9+10+11+12+13+14+15+16+17+18+19+20+21+22+23+24+25+26+27+28+29+30+31+32+33+34+35+36+37+38+39+40+41+42+43+44+45+46+47+48+49+50+51+52+53+54+55+56+57+58+59+60+61+62+63+64+65+66+67+68+69+70+71+72+73+74+75+76+77+78+79+80`],
  ["CB08", String.raw`(x+y)^n=\sum_{k=0}^{n}\binom{n}{k}x^{n-k-1}y^k`],
  ["SUM80SP", String.raw`1 + 2 + 3 + 4 + 5 + 6 + 7 + 8 + 9 + 10 + 11 + 12 + 13 + 14 + 15 + 16 + 17 + 18 + 19 + 20 + 21 + 22 + 23 + 24 + 25 + 26 + 27 + 28 + 29 + 30 + 31 + 32 + 33 + 34 + 35 + 36 + 37 + 38 + 39 + 40 + 41 + 42 + 43 + 44 + 45 + 46 + 47 + 48 + 49 + 50 + 51 + 52 + 53 + 54 + 55 + 56 + 57 + 58 + 59 + 60 + 61 + 62 + 63 + 64 + 65 + 66 + 67 + 68 + 69 + 70 + 71 + 72 + 73 + 74 + 75 + 76 + 77 + 78 + 79 + 80`],
  ["VMAT", String.raw`\begin{vmatrix}2&3\\1&4\end{vmatrix}`],
];

const math = (latex: string): RichText => [{ type: "inlineMath", latex }];
const text = (t: string): RichText => [{ type: "text", text: t }];
const question = (answer: object): Block =>
  ({ id: id(), type: "question", stem: [{ id: id(), type: "paragraph", content: text("Q") }], answer }) as unknown as Block;

const NBSP = /\u00a0/g;
const squash = (s: string) => s.replace(/[\s\u00a0]+/g, "");
/** The width the line really takes: the glyph advances textkit placed (it may squeeze a few hundredths of a point per glyph to fit). */
const inkWidth = (line: Line) =>
  (line.runs ?? []).flatMap((r) => r.positions ?? []).reduce((w, p) => w + (p.xAdvance ?? 0), 0);
const printed = (node: Node) => (node.lines ?? []).map((l) => (l.string ?? "").replace(NBSP, " "));

/** Where the formula goes, and the blocks that put it there (one question per formula). */
const POSITIONS: Record<string, (latex: string) => Block> = {
  matching_dir: (latex) =>
    question({ kind: "matching", pairs: [{ id: id(), left: text("Par"), right: math(latex) }] }),
  matching_esq: (latex) =>
    question({ kind: "matching", pairs: [{ id: id(), left: math(latex), right: text("Par") }] }),
  celula: (latex) =>
    question({ kind: "table", rows: [[text("A"), text("B"), text("C")], [math(latex), math(latex), text("fim")]] }),
  alternativa: (latex) =>
    question({ kind: "multipleChoice", alternatives: [{ id: id(), content: math(latex), correct: true }, { id: id(), content: text("fim") }] }),
  verdadeiro_falso: (latex) =>
    question({ kind: "trueFalse", items: [{ id: id(), content: math(latex), value: true }] }),
  ordenacao: (latex) =>
    question({ kind: "ordering", items: [{ id: id(), content: math(latex) }, { id: id(), content: text("fim") }] }),
  caixa_de_selecao: (latex) =>
    question({ kind: "checkbox", items: [{ id: id(), content: math(latex), correct: true }] }),
  paragrafo: (latex) => ({ id: id(), type: "paragraph", content: [...text("Veja "), ...math(latex), ...text(" e confira.")] }) as unknown as Block,
  enunciado: (latex) =>
    ({ id: id(), type: "question", stem: [{ id: id(), type: "paragraph", content: [...text("Veja "), ...math(latex)] }], answer: { kind: "open" } }) as unknown as Block,
};

describe("fórmula inline em coluna estreita: nada some, nada ganha hífen, cabe na caixa (N-M-001, N-U-001)", () => {
  for (const [position, build] of Object.entries(POSITIONS)) {
    it(`${position}: as ${FORMULAS.length} fórmulas saem inteiras e cabem`, async () => {
      const nodes = await layout(FORMULAS.map(([, latex]) => build(latex)));
      const all = nodes.map((n) => printed(n).join("")).map(squash).join("\n");
      for (const [name, latex] of FORMULAS) {
        // the formula, in order, with nothing inserted inside it (a hyphen would break this)
        expect(all, `${position} ${name}`).toContain(squash(latex));
      }
      // a box that holds ONLY a formula: every line fits the box's real width (inline in a sentence it shares the box)
      if (position === "paragrafo" || position === "enunciado") return;
      const formulaOnly = nodes.filter((n) => FORMULAS.some(([, latex]) => squash(printed(n).join("")) === squash(latex)));
      expect(formulaOnly.length).toBeGreaterThan(0);
      for (const node of formulaOnly) {
        for (const line of node.lines ?? []) {
          expect(inkWidth(line), `${position}: "${line.string}"`).toBeLessThanOrEqual((node.box?.width ?? 0) + 0.01);
        }
      }
    });
  }
});

describe("fórmula em bloco longa e sem espaço: corta em ponto seguro, sem hífen (N-U-001)", () => {
  const SUM80 = Array.from({ length: 80 }, (_, i) => i + 1).join("+");
  const block = (latex: string) => ({ id: id(), type: "blockMath", latex }) as unknown as Block;
  const inStem = (latex: string) =>
    ({ id: id(), type: "question", stem: [{ id: id(), type: "paragraph", content: text("Q") }, block(latex)], answer: { kind: "open" } }) as unknown as Block;

  for (const [where, make] of [["na folha", block], ["no enunciado de uma questão", inStem]] as const) {
    it(`${where}: as 80 parcelas saem inteiras, cada linha termina num "+" e cabe`, async () => {
      const nodes = await layout([make(SUM80)]);
      const formulaNodes = nodes.filter((n) => /^[\d+]+$/.test(squash(printed(n).join(""))));
      expect(formulaNodes.length).toBeGreaterThan(1);
      expect(formulaNodes.map((n) => squash(printed(n).join(""))).join("")).toBe(SUM80);
      for (const node of formulaNodes) {
        const lines = printed(node).map((l) => l.trim());
        expect(lines.join("")).not.toContain("-");
        for (const line of node.lines ?? []) expect(inkWidth(line)).toBeLessThanOrEqual((node.box?.width ?? 0) + 0.01);
      }
      // every line but the last ends right after an operator: no number is split
      for (const node of formulaNodes.slice(0, -1)) expect(squash(printed(node).join("")).endsWith("+")).toBe(true);
    });
  }
});
