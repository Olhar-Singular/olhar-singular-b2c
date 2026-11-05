/**
 * Célula de tabela mais alta que a folha não trava a exportação nem perde texto (L9BC-1).
 *
 * O cabeçalho é `fixed` e a linha do corpo é `wrap={false}`. Com uma célula maior que a folha,
 * o cabeçalho fixo era repintado em toda folha e o paginador do react-pdf nunca avançava (aba
 * congelada, depois falta de memória); no corpo, a linha passava do pé da folha e o que sobrava
 * era cortado. Roda o layout REAL.
 */
import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { AdaptationPdf } from "./AdaptationPdf";
import { PAGE_HEIGHT_PT, PAGE_MARGIN_PT } from "../pageTokens";
import type { Block, CanonicalDocument, RichText } from "@/lib/adaptation/canonical/schema";

const id = (() => {
  let n = 0;
  return () => `00000000-0000-4000-8000-${String(++n).padStart(12, "0")}`;
})();

type Node = { box?: { top?: number; height?: number }; lines?: Array<{ string?: string }>; children?: Node[] };

const text = (t: string): RichText => [{ type: "text", text: t }];
const math = (latex: string): RichText => [{ type: "inlineMath", latex }];
const terms = (n: number) => Array.from({ length: n }, (_, i) => `a_{${i + 1}}`).join(" + ");

async function layout(rows: RichText[][], fontSize?: number): Promise<{ pages: Node[]; text: string; formula: string }> {
  const block = {
    id: id(),
    type: "question",
    stem: [{ id: id(), type: "paragraph", content: text("Complete") }],
    answer: { kind: "table", rows },
  } as unknown as Block;
  const doc: CanonicalDocument = { schemaVersion: 1, blocks: [block] };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc, ...(fontSize ? { pageStyle: { fontSize } } : {}) } as never));
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
  // só as linhas que são fórmula (o rodapé "Página x de y" e as outras células ficam de fora)
  const formula = out.filter((l) => /^[a_{}\d+\s\u00a0\u00ad]+$/.test(l) && /[a_]/.test(l)).join("");
  return { pages: tree.children ?? [], text: out.join(""), formula };
}

/** O ponto mais baixo (pt, na folha) de um nó de texto que é só fórmula, em qualquer folha. */
async function lowestFormulaBottomPt(pages: Node[]): Promise<number> {
  let lowest = 0;
  const walk = (n: Node, top: number) => {
    const y = top + (n.box?.top ?? 0);
    const joined = (n.lines ?? []).map((l) => l.string ?? "").join("");
    if (n.lines?.length && /^[a_{}\d+\s\u00a0\u00ad]+$/.test(joined) && /[a_]/.test(joined)) {
      lowest = Math.max(lowest, y + (n.box?.height ?? 0));
    }
    (n.children ?? []).forEach((c) => walk(c, y));
  };
  pages.forEach((page) => walk(page, 0));
  return lowest;
}

const squash = (s: string) => s.replace(/[\s\u00a0\u00ad]+/g, "");
const FORMULA = terms(300);

describe("linha de tabela maior que a folha (L9BC-1)", () => {
  it("célula gigante NO CABEÇALHO: termina e não perde caractere", async () => {
    const { pages, formula } = await layout([[math(FORMULA), text("x")], [text("A"), text("B")]]);
    expect(pages.length).toBeGreaterThan(1);
    expect(pages.length).toBeLessThan(10);
    expect(squash(formula) === squash(FORMULA)).toBe(true);
  });

  it("célula gigante no corpo: termina, sai inteira e nada passa do pé da folha", async () => {
    const { pages, formula } = await layout([[text("A"), text("B")], [math(FORMULA), text("x")]]);
    expect(squash(formula) === squash(FORMULA)).toBe(true);
    // a linha é fatiada em quantas folhas precisar (indivisível, ficava inteira numa folha só, vazando o pé)
    expect(pages.length).toBeGreaterThanOrEqual(3);
    expect(await lowestFormulaBottomPt(pages)).toBeLessThanOrEqual(PAGE_HEIGHT_PT - PAGE_MARGIN_PT + 1);
  });

  it("fórmula de 70 termos a 16 pt numa célula: termina e sai inteira", async () => {
    const f = terms(70);
    const { formula } = await layout([[math(f), text("x")], [text("A"), text("B")]], 16);
    expect(squash(formula) === squash(f)).toBe(true);
  });

  it("tabela comum continua com o cabeçalho repetido e a linha indivisível", async () => {
    const rows: RichText[][] = [[text("Nome"), text("Valor")]];
    for (let i = 0; i < 60; i += 1) rows.push([text(`Linha ${i}`), text(String(i))]);
    const { pages, text: all } = await layout(rows);
    expect(pages.length).toBeGreaterThan(1);
    // o cabeçalho "Nome" é repetido em cada folha da tabela
    expect(all.split("Nome").length - 1).toBe(pages.length);
  });
});
