/**
 * A quebra de linha que cai num ESPAÇO da fórmula não imprime hífen (N-U-006, L9BC-9).
 *
 * Em matemática o traço no fim da linha lê-se como sinal de menos (`14-`, `2-`, `&-`,
 * `\sum-`). A causa: o vão do LaTeX entre dois pedaços era um NBSP em string própria, e o
 * textkit trata essa string como sílaba solta (o `trim()` a vê vazia, o `!== " "` a vê
 * diferente de espaço): a sílaba anterior ganha um ponto de hifenização e o "-" sai no fim
 * da linha. O vão agora fecha o pedaço anterior, na MESMA string. Roda o layout REAL.
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

type Node = { lines?: Array<{ string?: string }>; children?: Node[] };

async function printed(blocks: Block[]): Promise<string[]> {
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc }));
  const tree = (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
  const out: string[] = [];
  const walk = (n: Node) => {
    for (const l of n.lines ?? []) out.push(l.string ?? "");
    (n.children ?? []).forEach(walk);
  };
  walk(tree);
  return out;
}

const squash = (s: string) => s.replace(/[\s\u00a0]+/g, "");
const math = (latex: string): RichText => [{ type: "inlineMath", latex }];
const text = (t: string): RichText => [{ type: "text", text: t }];

/** Os casos do relatório (AR17, MT04, MT08, ES01, IA137, IA139, MO10, AR16) e uma conta de 80 termos. */
const FORMULAS: Array<[string, string]> = [
  ["AR17", String.raw`\begin{array}{r|l} 84 & 6 \\ \underline{6} & 14 \\ 24 & \\ \underline{24} & \\ 0 & \end{array}`],
  ["MT04", String.raw`\left[\begin{array}{cc} 1 & 2 \\ 3 & 4 \end{array}\right]`],
  ["MT08", String.raw`\begin{pmatrix} 1 & 2 & 3 \\ 4 & 5 & 6 \\ 7 & 8 & 9 \end{pmatrix}`],
  ["ES01", String.raw`\bar{x}=\frac{\sum x_i}{n}`],
  ["IA137", String.raw`\begin{array}{@{}c@{\,}c@{}c} & 3 & 4 & 7 \\ + & 2 & 5 & 6 \\ \hline \end{array}`],
  ["IA139", String.raw`\begin{array}{@{}c@{\,}c} & 2 & 3 \\ \times & & 4 \\ \hline \end{array}`],
  ["MO10", String.raw`\text{R\$ }10{,}00 + \text{R\$ }20{,}50 = \text{R\$ }30{,}50`],
  ["AR16", String.raw`\begin{array}{r} 1.250 \\ +\ 380 \\ \hline 1.630 \end{array}`],
  // Sem espaço e com mais de 30 caracteres, depois de texto: a marca de "não hifenize" ia parar no run do texto.
  ["AR22", String.raw`3\frac{1}{2}-1\frac{3}{4}=1\frac{3}{4}`],
  ["CB08", String.raw`(x+y)^n=\sum_{k=0}^{n}\binom{n}{k}x^{n-k}y^k`],
  ["BO38", String.raw`x^{10}+9x^{9}+8x^{8}+7x^{7}+6x^{6}+5x^{5}+4x^{4}+3x^{3}+2x^{2}+x+1=0`],
  ["SOMA", Array.from({ length: 80 }, (_, i) => i + 1).join(" + ")],
];

// Várias distâncias até a margem: em alguma a quebra cai no espaço da fórmula.
const LEADS = [0, 5, 6, 7, 8, 9, 10, 11].map((n) => "Calcule ".repeat(n));

const lineBreakPoints = (lines: string[]) => lines.filter((l) => /-$/.test(l.replace(/[\s\u00a0]+$/, "")));

describe("fórmula quebrada num espaço: nenhum caractere a mais (N-U-006)", () => {
  for (const [name, latex] of FORMULAS) {
    it(`${name} no parágrafo, em ${LEADS.length} distâncias da margem`, async () => {
      for (const lead of LEADS) {
        const lines = await printed([
          { id: id(), type: "paragraph", content: [...text(lead), ...math(latex), ...text(" e confira.")] } as unknown as Block,
        ]);
        const all = squash(lines.join(""));
        // a fórmula inteira, em ordem, sem nada inserido dentro dela (um "-" quebraria isto)
        expect(all, `${name} lead=${lead.length}`).toContain(squash(latex));
        // e nenhuma linha termina em hífen que a fórmula não tinha
        if (!/-$/.test(latex)) expect(lineBreakPoints(lines), `${name} lead=${lead.length}`).toEqual([]);
      }
    });
  }

  it("título (heading) e legenda de figura também saem sem hífen", async () => {
    const TINY_PNG =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==";
    for (const [name, latex] of FORMULAS.slice(0, 11)) {
      for (const lead of LEADS.slice(0, 5)) {
        const heading = { id: id(), type: "heading", level: 2, content: [...text(lead), ...math(latex)] } as unknown as Block;
        const image = {
          id: id(),
          type: "image",
          src: TINY_PNG,
          alt: "figura",
          caption: [...text(lead), ...math(latex)],
        } as unknown as Block;
        for (const block of [heading, image]) {
          const lines = await printed([block]);
          expect(squash(lines.join("")), `${name} ${block.type}`).toContain(squash(latex));
          if (!/-$/.test(latex)) expect(lineBreakPoints(lines), `${name} ${block.type}`).toEqual([]);
        }
      }
    }
  });

  const question = (answer: object): Block =>
    ({ id: id(), type: "question", stem: [{ id: id(), type: "paragraph", content: text("Q") }], answer }) as unknown as Block;
  const NARROW: Record<string, (latex: string) => Block> = {
    celula: (latex) =>
      question({ kind: "table", rows: [[text("A"), text("B"), text("C")], [math(latex), math(latex), text("fim")]] }),
    alternativa: (latex) =>
      question({ kind: "multipleChoice", alternatives: [{ id: id(), content: math(latex), correct: true }] }),
    pareamento: (latex) =>
      question({ kind: "matching", pairs: [{ id: id(), left: text("Par"), right: math(latex) }] }),
    ordenacao: (latex) => question({ kind: "ordering", items: [{ id: id(), content: math(latex) }] }),
  };
  for (const [where, build] of Object.entries(NARROW)) {
    it(`coluna estreita (${where}): sem hífen no fim da linha`, async () => {
      for (const [name, latex] of FORMULAS) {
        const lines = await printed([build(latex)]);
        expect(squash(lines.join("")), `${where} ${name}`).toContain(squash(latex));
        if (!/-$/.test(latex)) expect(lineBreakPoints(lines), `${where} ${name}`).toEqual([]);
      }
    });
  }

  it("apoio (andaime) com fórmula crua longa e sem espaço: parte em ponto seguro, sem hífen e sem perder caractere", async () => {
    const RAW = Array.from({ length: 80 }, () => "x").join("+");
    for (const lead of ["", "Passo ", "Some todos os termos: "]) {
      const lines = await printed([{ id: id(), type: "scaffolding", items: [lead + RAW] } as unknown as Block]);
      expect(squash(lines.join(""))).toContain(squash(lead + RAW));
      expect(lineBreakPoints(lines.filter((l) => l.includes("x+x")))).toEqual([]);
    }
  });
});
