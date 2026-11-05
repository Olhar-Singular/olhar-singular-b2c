/**
 * Linha de tabela alta fatiada em faixas: nenhum caractere de nenhuma célula some e as colunas
 * ficam alinhadas (L10-1). Roda o layout REAL do react-pdf.
 *
 * A regressão do Lote 10: a linha estimada acima de 80% da folha ficava fatiável e o react-pdf,
 * ao fatiar uma linha em que DUAS células cruzam a virada de folha, perdia o resto de uma célula
 * e jogava a outra, sem borda, na margem esquerda da folha seguinte. Agora a linha alta é fatiada
 * por `tableRowBands` em faixas indivisíveis.
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

type Line = { string?: string; box?: { x?: number; y?: number } };
type Style = { fontWeight?: string | number; paddingTop?: number; paddingBottom?: number; borderBottomWidth?: number; borderRightWidth?: number; flexGrow?: number };
type Node = { box?: { left?: number; top?: number }; style?: Style; lines?: Line[]; children?: Node[] };
type Painted = { page: number; x: number; words: string[] };

function paint(node: Node, page: number, dx: number, dy: number, out: Painted[]) {
  const left = dx + (node.box?.left ?? 0);
  const top = dy + (node.box?.top ?? 0);
  for (const line of node.lines ?? []) {
    out.push({ page, x: left + (line.box?.x ?? 0), words: (line.string ?? "").split(/\s+/).filter(Boolean) });
  }
  for (const child of node.children ?? []) paint(child, page, left, top, out);
}

const WORD = "palavra";
const body = (n: number) => {
  const out: string[] = [];
  while (out.join(" ").length < n) out.push(WORD);
  return out.join(" ");
};
const cell = (r: number, c: number, n: number): RichText => {
  const half = Math.floor(n / 2);
  return [{ type: "text", text: `R${r}C${c}a ${body(half)} R${r}C${c}m ${body(n - half)} R${r}C${c}z` }];
};

async function layout(rows: RichText[][], fillers: number, fontSize?: number): Promise<{ pages: number; lines: Painted[]; cells: Node[]; texts: Node[] }> {
  const blocks: Block[] = [];
  for (let i = 0; i < fillers; i += 1) {
    blocks.push({ id: id(), type: "paragraph", content: [{ type: "text", text: `Linha ${i}` }] } as Block);
  }
  blocks.push({
    id: id(),
    type: "question",
    stem: [{ id: id(), type: "paragraph", content: [{ type: "text", text: "Complete" }] }],
    answer: { kind: "table", rows },
  } as unknown as Block);
  const doc: CanonicalDocument = { schemaVersion: 1, blocks };
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: doc, ...(fontSize ? { pageStyle: { fontSize } } : {}) } as never));
  const tree = (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
  const lines: Painted[] = [];
  (tree.children ?? []).forEach((page, p) => paint(page, p, 0, 0, lines));
  const cells: Node[] = [];
  const texts: Node[] = [];
  const collect = (n: Node) => {
    if (n.lines?.length) texts.push(n);
    if (n.style?.flexGrow === 1 && (n.style.borderRightWidth ?? 0) > 0) cells.push(n);
    (n.children ?? []).forEach(collect);
  };
  collect(tree);
  return { pages: (tree.children ?? []).length, lines, cells, texts };
}

/** Confere que cada célula saiu inteira (início, meio e fim) e que as colunas não se mexeram. */
function check(rows: number, cols: number, len: number, result: { lines: Painted[] }) {
  const words = result.lines.flatMap((l) => l.words);
  const count = (w: string) => words.filter((x) => x === w).length;
  const lost: string[] = [];
  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      for (const k of ["a", "m", "z"]) if (count(`R${r}C${c}${k}`) !== 1) lost.push(`R${r}C${c}${k} x${count(`R${r}C${c}${k}`)}`);
    }
  }
  const half = Math.floor(len / 2);
  const per = body(half).split(" ").length + body(len - half).split(" ").length;
  expect({ lost, palavras: count(WORD) }).toEqual({ lost: [], palavras: rows * cols * per });
  // cada coluna começa no mesmo x em toda linha e em toda folha
  const startX = (c: number) =>
    result.lines.filter((l) => l.words.some((w) => new RegExp(`^R\\d+C${c}a$`).test(w))).map((l) => l.x);
  const xs = Array.from({ length: cols }, (_, c) => startX(c));
  xs.forEach((list) => expect(Math.max(...list) - Math.min(...list)).toBeLessThan(0.5));
  xs.slice(1).forEach((list, c) => expect(Math.min(...list)).toBeGreaterThan(Math.max(...xs[c])));
}

describe("linha de tabela alta: nada some, colunas alinhadas (L10-1)", () => {
  // 900 caracteres por célula era a janela em que a linha estimada passava de 80% da folha e o
  // react-pdf, ao fatiá-la, perdia texto; os vizinhos conferem a fronteira
  const CASES = [
    { rows: 4, cols: 2, len: 900, fillers: 0 },
    { rows: 4, cols: 2, len: 900, fillers: 25 },
    { rows: 4, cols: 2, len: 900, fillers: 26 },
    { rows: 5, cols: 2, len: 900, fillers: 0 },
    { rows: 4, cols: 2, len: 880, fillers: 0 },
    { rows: 4, cols: 2, len: 1000, fillers: 13 },
    { rows: 4, cols: 3, len: 1500, fillers: 7 },
    { rows: 4, cols: 2, len: 2500, fillers: 0 },
  ];
  for (const { rows, cols, len, fillers } of CASES) {
    it(`${rows} linhas x ${cols} colunas, ${len} caracteres por célula, ${fillers} parágrafos antes`, async () => {
      const table = Array.from({ length: rows }, (_, r) => Array.from({ length: cols }, (_, c) => cell(r, c, len)));
      const result = await layout(table, fillers);
      check(rows, cols, len, result);
    });
  }

  it("corpo 16: a mesma varredura de fronteira", async () => {
    const table = Array.from({ length: 4 }, (_, r) => Array.from({ length: 2 }, (_, c) => cell(r, c, 600)));
    check(4, 2, 600, await layout(table, 0, 16));
  });

  it("células de tamanhos diferentes na mesma linha: a menor não some e as colunas seguem", async () => {
    const table = [
      [cell(0, 0, 40), cell(0, 1, 40), cell(0, 2, 40)],
      [cell(1, 0, 1800), cell(1, 1, 60), cell(1, 2, 1200)],
      [cell(2, 0, 100), cell(2, 1, 2200), cell(2, 2, 100)],
    ];
    const result = await layout(table, 0);
    const words = result.lines.flatMap((l) => l.words);
    for (let r = 0; r < 3; r += 1) for (let c = 0; c < 3; c += 1) for (const k of ["a", "m", "z"]) {
      const hits = words.filter((w) => w === `R${r}C${c}${k}`).length;
      // o cabeçalho curto é fixo: repete a cada folha por desenho
      if (r === 0) expect(hits).toBeGreaterThanOrEqual(1);
      else expect(hits).toBe(1);
    }
  });

  it("nas emendas a célula não leva fio nem recuo: a de cima só o fio de baixo some, a de baixo só o recuo de cima", async () => {
    const table = [
      [[{ type: "text", text: "H" }], [{ type: "text", text: "H2" }]],
      [[{ type: "text", text: "palavra ".repeat(300) }], [{ type: "text", text: "x" }]],
    ] as RichText[][];
    const { cells } = await layout(table, 0);
    const shape = (n: Node) => [n.style?.paddingTop, n.style?.paddingBottom, n.style?.borderBottomWidth];
    const PAD = 3;
    const RULE = 0.75;
    // cabeçalho curto (fixo, repetido a cada folha): célula inteira
    expect(shape(cells[0])).toEqual([PAD, PAD, RULE]);
    expect(shape(cells[1])).toEqual([PAD, PAD, RULE]);
    const body = cells.filter((n) => JSON.stringify(shape(n)) !== JSON.stringify([PAD, PAD, RULE]));
    const left = body.filter((_, i) => i % 2 === 0);
    const right = body.filter((_, i) => i % 2 === 1);
    expect(left.length).toBeGreaterThan(2);
    expect(shape(left[0])).toEqual([PAD, 0, 0]);
    left.slice(1, -1).forEach((n) => expect(shape(n)).toEqual([0, 0, 0]));
    expect(shape(left[left.length - 1])).toEqual([0, PAD, RULE]);
    // a célula curta tem as mesmas faixas, e as faixas sem texto não abrem um <Text> vazio
    expect(right).toHaveLength(left.length);
    expect(right[0].children?.length).toBeGreaterThan(0);
    right.slice(1).forEach((n) => expect(n.children ?? []).toHaveLength(0));
  });

  it("cabeçalho gigante (solto, em faixas) continua em negrito e o corpo não", async () => {
    const table = [[cell(0, 0, 1500), cell(0, 1, 1500)], [cell(1, 0, 100), cell(1, 1, 100)]];
    const { texts } = await layout(table, 0);
    const marked = (re: RegExp) => texts.filter((t) => (t.lines ?? []).some((l) => re.test(l.string ?? "")));
    const header = marked(/R0C\d[am]/);
    const body = marked(/R1C\d[az]/);
    expect(header.length).toBeGreaterThan(0);
    expect(body.length).toBeGreaterThan(0);
    header.forEach((t) => expect(t.style?.fontWeight).toBe(700));
    body.forEach((t) => expect(t.style?.fontWeight).not.toBe(700));
  });

  it("linha comum com célula vazia mantém o <Text> da célula (a altura de uma linha não muda)", async () => {
    const table = [[[{ type: "text", text: "H" }], [{ type: "text", text: "H2" }]], [[], [{ type: "text", text: "x" }]]] as RichText[][];
    const { cells } = await layout(table, 0);
    expect(cells).toHaveLength(4);
    expect(cells[2].children ?? []).toHaveLength(1);
    expect(cells[3].children ?? []).toHaveLength(1);
  });
});

describe("linha alta com fórmula grande misturada ao texto: nada some, colunas alinhadas (L11-1)", () => {
  /** Termos `a_N` de uma fórmula de ~`chars` caracteres, sem espaço (só corta em ponto seguro). */
  const formula = (chars: number) =>
    Array.from({ length: Math.ceil(chars / 5) }, (_, i) => `a_${i % 10}`).join("+").slice(0, chars - (chars % 1));
  const mixed = (r: number, c: number, words: number, latex: string): RichText => [
    { type: "text", text: `R${r}C${c}a ${Array.from({ length: words }, () => WORD).join(" ")} R${r}C${c}m ` },
    { type: "inlineMath", latex },
    { type: "text", text: ` R${r}C${c}z` },
  ];
  const terms = (latex: string) => latex.split("+").length;

  const CASES = [
    // o repro do Lote 11: 4 x 2, 66 palavras + fórmula de 308 caracteres, sem e com parágrafos antes
    { rows: 4, cols: 2, words: 66, chars: 308, fillers: 0, fontSize: undefined },
    { rows: 4, cols: 2, words: 66, chars: 308, fillers: 26, fontSize: undefined },
    { rows: 4, cols: 2, words: 66, chars: 76, fillers: 0, fontSize: undefined },
    { rows: 4, cols: 2, words: 40, chars: 700, fillers: 13, fontSize: undefined },
    { rows: 4, cols: 2, words: 30, chars: 300, fillers: 0, fontSize: 16 },
    { rows: 3, cols: 4, words: 20, chars: 160, fillers: 5, fontSize: undefined },
    { rows: 2, cols: 2, words: 0, chars: 2000, fillers: 0, fontSize: undefined },
  ];
  for (const { rows, cols, words, chars, fillers, fontSize } of CASES) {
    it(`${rows}x${cols}, ${words} palavras + fórmula de ${chars}, ${fillers} parágrafos antes${fontSize ? `, corpo ${fontSize}` : ""}`, async () => {
      const latex = formula(chars);
      const table = Array.from({ length: rows }, (_, r) =>
        Array.from({ length: cols }, (_, c) => mixed(r, c, words, latex)),
      );
      const result = await layout(table, fillers, fontSize);
      const printed = result.lines.flatMap((l) => l.words);
      const lost: string[] = [];
      for (let r = 0; r < rows; r += 1) {
        for (let c = 0; c < cols; c += 1) {
          for (const k of ["a", "m", "z"]) {
            const n = printed.filter((w) => w === `R${r}C${c}${k}`).length;
            if (n !== 1) lost.push(`R${r}C${c}${k} x${n}`);
          }
        }
      }
      const squashed = printed.join("").replace(/\u00a0/g, "");
      const atoms = squashed.split("a_").length - 1;
      expect({ lost, palavras: printed.filter((w) => w === WORD).length, atoms }).toEqual({
        lost: [],
        palavras: rows * cols * words,
        atoms: rows * cols * terms(latex),
      });
      const startX = (c: number) =>
        result.lines.filter((l) => l.words.some((w) => new RegExp(`^R\\d+C${c}a$`).test(w))).map((l) => l.x);
      const xs = Array.from({ length: cols }, (_, c) => startX(c));
      xs.forEach((list) => expect(Math.max(...list) - Math.min(...list)).toBeLessThan(0.5));
      // a caixa de uma linha pode recuar poucos pt (espaço no começo), mas nunca sai da margem
      result.lines.forEach((l) => expect(l.x).toBeGreaterThanOrEqual(36));
    });
  }
});
