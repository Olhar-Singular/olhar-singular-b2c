import { describe, it, expect } from "vitest";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import {
  estimatedRowHeightPt,
  rowNeedsSplit,
  headerNeedsRelease,
  tableRowBands,
  TABLE_ROW_SPLIT_PT,
  TABLE_BAND_PT,
  TABLE_HEADER_RELEASE_PT,
  tableCellColumnPt,
} from "./tableRowFit";
import { PDF_CONTENT_WIDTH_PT } from "./mathToPdfText";
import { mathPdfFontSizePt } from "../pageTokens";
import { KEEP_PAGE_PT } from "./keepTogether";

const text = (n: number): RichText => [{ type: "text", text: "palavra ".repeat(n) }];
const math = (terms: number): RichText => [
  { type: "inlineMath", latex: Array.from({ length: terms }, (_, i) => `a_${i + 1}`).join(" + ") },
];

describe("estimatedRowHeightPt", () => {
  it("uma linha curta mede uma linha de texto mais o recuo", () => {
    const h = estimatedRowHeightPt([text(1), text(1)], 12, 200);
    expect(h).toBeGreaterThan(12);
    expect(h).toBeLessThan(60);
  });

  it("a célula mais alta manda na linha", () => {
    const short = estimatedRowHeightPt([text(1), text(1)], 12, 200);
    const tall = estimatedRowHeightPt([text(1), text(200)], 12, 200);
    expect(tall).toBeGreaterThan(short * 10);
  });

  it("cresce com o corpo da fonte e com a coluna mais estreita", () => {
    const base = estimatedRowHeightPt([text(60)], 12, 200);
    expect(estimatedRowHeightPt([text(60)], 18, 200)).toBeGreaterThan(base);
    expect(estimatedRowHeightPt([text(60)], 12, 100)).toBeGreaterThan(base);
  });

  it("fórmula conta em Courier (mais larga que o texto) e quebra de linha explícita conta", () => {
    expect(estimatedRowHeightPt([math(40)], 12, 200)).toBeGreaterThan(estimatedRowHeightPt([text(40)], 12, 200) * 0.9);
    const lines = estimatedRowHeightPt([[{ type: "text", text: "a\nb\nc\nd" }]], 12, 400);
    const one = estimatedRowHeightPt([[{ type: "text", text: "abcd" }]], 12, 400);
    expect(lines).toBeGreaterThan(one);
  });

  it("célula vazia e linha sem células medem só o recuo", () => {
    expect(estimatedRowHeightPt([[]], 12, 200)).toBeGreaterThan(0);
    expect(estimatedRowHeightPt([], 12, 200)).toBeGreaterThan(0);
  });
});

describe("rowNeedsSplit e headerNeedsRelease", () => {
  it("linha de tabela comum cabe inteira: não precisa fatiar", () => {
    expect(rowNeedsSplit([text(2), text(3), text(1)], 12, 150)).toBe(false);
    expect(headerNeedsRelease([text(1), text(1)], 12, 150)).toBe(false);
  });

  it("célula do tamanho de uma folha precisa fatiar (L9BC-1)", () => {
    expect(rowNeedsSplit([math(300), text(1)], 12, 250)).toBe(true);
    expect(estimatedRowHeightPt([math(300), text(1)], 12, 250)).toBeGreaterThan(TABLE_ROW_SPLIT_PT);
  });

  it("o cabeçalho é solto bem antes: repetido em toda folha, ele não pode ocupar meia folha", () => {
    // uma linha de 40% da folha ainda cabe inteira, mas, como cabeçalho repetido, já é demais
    let n = 1;
    while (!headerNeedsRelease([text(n)], 12, 250)) n += 1;
    expect(rowNeedsSplit([text(n)], 12, 250)).toBe(false);
    expect(estimatedRowHeightPt([text(n)], 12, 250)).toBeLessThan(KEEP_PAGE_PT / 2 + 40);
  });

  it("fica de fora o que está só um pouco abaixo do limite", () => {
    let n = 1;
    while (!rowNeedsSplit([text(n)], 12, 250)) n += 1;
    expect(rowNeedsSplit([text(n - 5)], 12, 250)).toBe(false);
  });
});

/** Recuo de cima e de baixo (3 pt cada) mais o fio da célula (0,75 pt). */
const CELL_OVERHEAD_PT = 6.75;
const cell = (t: string): RichText => [{ type: "text", text: t }];

describe("estimativa da altura: fronteiras (L10-1)", () => {
  it("a linha vazia mede uma entrelinha do corpo mais o recuo e o fio da célula", () => {
    expect(estimatedRowHeightPt([[]], 10, 200)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([], 10, 200)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
  });

  it("o texto mede 0,75 em por caractere, com 15% de sobra de quebra: 8 caracteres a 10 pt são 69 pt", () => {
    // 8 x 7,5 x 1,15 = 69: cabe numa coluna de 69,1 pt, passa para duas em 68,9 pt
    expect(estimatedRowHeightPt([cell("abcdefgh")], 10, 69.1)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([cell("abcdefgh")], 10, 68.9)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
  });

  it("a caixa alta mede 1,15 em por caractere: 8 letras a 10 pt são 105,8 pt", () => {
    // 8 x 11,5 x 1,15 = 105,8 (a OpenDyslexic chega a 1,19 em em Q, 1,16 em V e 1,15 em G)
    expect(estimatedRowHeightPt([cell("ABCDEFGH")], 10, 105.9)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([cell("ABCDEFGH")], 10, 105.7)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
  });

  it("o W mede 1,45 em (na OpenDyslexic são 1,42): 8 W a 10 pt são 133,4 pt (N-U, parede de W/M)", () => {
    expect(estimatedRowHeightPt([cell("WWWWWWWW")], 10, 133.5)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([cell("WWWWWWWW")], 10, 133.3)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
  });

  it("o M mede 1,25 em (na OpenDyslexic são 1,24): 8 M a 10 pt são 115 pt", () => {
    expect(estimatedRowHeightPt([cell("MMMMMMMM")], 10, 115.1)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([cell("MMMMMMMM")], 10, 114.9)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
  });

  it("o m minúsculo mede 1,2 em (na OpenDyslexic são 1,17): 8 m a 10 pt são 110,4 pt", () => {
    expect(estimatedRowHeightPt([cell("mmmmmmmm")], 10, 110.5)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([cell("mmmmmmmm")], 10, 110.3)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
  });

  it("empacota palavra a palavra: duas palavras de 63% da coluna ocupam duas linhas, não 1,3 (parede de W na OpenDyslexic)", () => {
    // "WWWWWWW " a 10 pt = (7 x 14,5 + 7,5) x 1,15 = 125,35 pt; em 200 pt só cabe uma por linha
    const wall = cell("WWWWWWW ".repeat(10));
    expect(estimatedRowHeightPt([wall], 10, 200)).toBeCloseTo(10 * 14 + CELL_OVERHEAD_PT, 6);
    // em 250,7 pt cabem duas por linha: 5 linhas
    expect(estimatedRowHeightPt([wall], 10, 250.7)).toBeCloseTo(5 * 14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([wall], 10, 250.6)).toBeCloseTo(10 * 14 + CELL_OVERHEAD_PT, 6);
  });

  it("uma palavra mais larga que a coluna ocupa várias linhas e a seguinte continua na última delas", () => {
    // "WWWWWWWWWWWWWWWWWWWW" (20 W) a 10 pt = 290 x 1,15 = 333,5 pt: em 100 pt são 4 linhas (3 e meia)
    expect(estimatedRowHeightPt([cell("W".repeat(20))], 10, 100)).toBeCloseTo(4 * 14 + CELL_OVERHEAD_PT, 6);
    // a palavra curta que vem depois cabe na sobra da 4ª linha (66,5 pt usados de 100; "a " = 17,25)
    expect(estimatedRowHeightPt([cell("W".repeat(20) + " a")], 10, 100)).toBeCloseTo(4 * 14 + CELL_OVERHEAD_PT, 6);
  });

  it("texto misto comum não infla: minúsculas seguem a 0,75 em e só a maiúscula conta mais", () => {
    // "Ana viu o rio" = 13 caracteres: 1 A de 1,15 e 12 de 0,75 (os espaços entram) = 10,15 em
    const em = 1.15 + 12 * 0.75;
    expect(estimatedRowHeightPt([cell("Ana viu o rio")], 10, em * 10 * 1.15 + 0.1)).toBeCloseTo(14 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([cell("Ana viu o rio")], 10, em * 10 * 1.15 - 0.1)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
  });

  it("caixa alta acentuada também conta como alta", () => {
    expect(estimatedRowHeightPt([cell("ÁÉÍÓÚÂÊÔ")], 10, 105.7)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
  });

  it("o corpo de um run manda na largura e na entrelinha dele", () => {
    const big: RichText = [{ type: "text", text: "abcdefgh", fontSize: 20 }];
    // 8 x 15 x 1,15 = 138 pt; entrelinha de 28 pt
    expect(estimatedRowHeightPt([big], 10, 138.1)).toBeCloseTo(28 + CELL_OVERHEAD_PT, 6);
    expect(estimatedRowHeightPt([big], 10, 137.9)).toBeCloseTo(56 + CELL_OVERHEAD_PT, 6);
  });

  it("célula com fórmula leva a entrelinha da fórmula (maior que a do texto)", () => {
    const mathPt = mathPdfFontSizePt(10);
    expect(mathPt).toBeGreaterThan(10);
    const h = estimatedRowHeightPt([[{ type: "inlineMath", latex: "x" }]], 10, 200);
    expect(h).toBeCloseTo(1.4 * mathPt + CELL_OVERHEAD_PT, 6);
    // a fórmula mede 0,6 em (Courier) do corpo dela: 40 caracteres = 24 em
    const wide = estimatedRowHeightPt([[{ type: "inlineMath", latex: "x".repeat(40) }]], 10, mathPt * 24 * 1.15 - 0.1);
    expect(wide).toBeCloseTo(2 * 1.4 * mathPt + CELL_OVERHEAD_PT, 6);
  });

  it("cada quebra explícita abre uma linha", () => {
    expect(estimatedRowHeightPt([cell("a\nb\nc")], 10, 200)).toBeCloseTo(42 + CELL_OVERHEAD_PT, 6);
  });

  it("o limiar de fatiar é 90% da área útil da folha: 48 linhas cabem, 49 não", () => {
    expect(TABLE_ROW_SPLIT_PT).toBeCloseTo(685.8, 6);
    const lines = (n: number) => [cell(Array.from({ length: n }, () => "a").join("\n"))];
    expect(estimatedRowHeightPt(lines(48), 10, 200)).toBeLessThanOrEqual(TABLE_ROW_SPLIT_PT);
    expect(rowNeedsSplit(lines(48), 10, 200)).toBe(false);
    expect(estimatedRowHeightPt(lines(49), 10, 200)).toBeGreaterThan(TABLE_ROW_SPLIT_PT);
    expect(rowNeedsSplit(lines(49), 10, 200)).toBe(true);
  });

  it("o cabeçalho é solto a 35% da folha: 19 linhas ficam fixas, 20 são soltas", () => {
    expect(TABLE_HEADER_RELEASE_PT).toBeCloseTo(266.7, 6);
    const lines = (n: number) => [cell(Array.from({ length: n }, () => "a").join("\n"))];
    expect(headerNeedsRelease(lines(18), 10, 200)).toBe(false);
    expect(headerNeedsRelease(lines(19), 10, 200)).toBe(true);
  });
});

const textOf = (c: RichText) => c.map((r) => (r.type === "text" ? r.text : `<${r.latex}>`)).join("");
const latexOf = (c: RichText) => c.map((r) => (r.type === "inlineMath" ? r.latex : "")).join("");
const sentence = (n: number, tag: string) => `${tag}a ` + "palavra ".repeat(n) + `${tag}z`;

describe("tableRowBands: a linha alta em faixas indivisíveis (L10-1)", () => {
  it("linha que cabe numa folha volta como está, numa faixa só", () => {
    const row = [cell(sentence(30, "A")), cell("curta")];
    expect(tableRowBands(row, 11, 250)).toEqual([row]);
  });

  it("a fronteira: a linha estimada em até 90% da folha fica inteira, acima vira faixas", () => {
    const lines = (n: number) => [cell(Array.from({ length: n }, (_, i) => `l${i}`).join("\n"))];
    expect(tableRowBands(lines(48), 10, 200)).toHaveLength(1);
    expect(tableRowBands(lines(49), 10, 200)!.length).toBeGreaterThan(1);
  });

  it("nenhum caractere se perde: as faixas de cada célula, em ordem, são o texto dela", () => {
    const row = [cell(sentence(900, "A")), cell(sentence(1200, "B")), cell("curta")];
    const bands = tableRowBands(row, 11, 250)!;
    expect(bands.length).toBeGreaterThan(2);
    row.forEach((original, c) => {
      expect(bands.map((band) => textOf(band[c])).join("")).toBe(textOf(original));
    });
  });

  it("cada faixa cabe numa folha, com folga: a estimativa de nenhuma passa de TABLE_BAND_PT + recuo", () => {
    const bands = tableRowBands([cell(sentence(2000, "A")), cell(sentence(300, "B"))], 11, 250)!;
    for (const band of bands) {
      expect(estimatedRowHeightPt(band, 11, 250)).toBeLessThanOrEqual(TABLE_BAND_PT + CELL_OVERHEAD_PT);
      expect(rowNeedsSplit(band, 11, 250)).toBe(false);
    }
  });

  it("as faixas são cheias: toda faixa, menos a última, passa de três quartos da altura de faixa", () => {
    const bands = tableRowBands([cell(sentence(2000, "A")), cell(sentence(1400, "B"))], 11, 250)!;
    expect(bands.length).toBeGreaterThan(3);
    for (const band of bands.slice(0, -1)) {
      expect(estimatedRowHeightPt(band, 11, 250)).toBeGreaterThan(0.75 * TABLE_BAND_PT);
    }
  });

  it("célula mais curta fica nas primeiras faixas e as demais saem vazias (colunas alinhadas)", () => {
    const bands = tableRowBands([cell(sentence(2000, "A")), cell("curta")], 11, 250)!;
    expect(bands[0][1]).toEqual(cell("curta"));
    for (const band of bands.slice(1)) expect(band[1]).toEqual([]);
    expect(bands.every((band) => band.length === 2)).toBe(true);
  });

  it("marcas, cor e corpo do run passam para cada pedaço", () => {
    const row: RichText[] = [
      [
        { type: "text", text: "negrito ".repeat(700), marks: ["bold"], fontSize: 11 },
        { type: "text", text: "normal ".repeat(700), color: "#ff0000" },
      ],
    ];
    const bands = tableRowBands(row, 11, 250)!;
    expect(bands.length).toBeGreaterThan(2);
    const runs = bands.flatMap((band) => band[0]);
    for (const run of runs) {
      if (run.type !== "text") throw new Error("só texto");
      if (run.text.includes("negrito")) expect(run).toMatchObject({ marks: ["bold"], fontSize: 11 });
      else expect(run).toMatchObject({ color: "#ff0000" });
      expect(run.text.includes("negrito") && run.text.includes("normal")).toBe(false);
    }
  });

  it("a quebra explícita que cai na emenda é a própria emenda: o resto é o mesmo", () => {
    const original = Array.from({ length: 200 }, (_, i) => `linha ${i}`);
    const bands = tableRowBands([cell(original.join("\n"))], 10, 200)!;
    expect(bands.length).toBeGreaterThan(2);
    expect(bands.map((band) => textOf(band[0])).join("\n")).toBe(original.join("\n"));
  });

  it("quebra explícita que fecha a última faixa não deixa uma faixa vazia atrás", () => {
    // 24 linhas por faixa a 10 pt: 72 linhas terminadas em quebra fecham 3 faixas exatas
    const bands = tableRowBands([cell("a\n".repeat(72))], 10, 200)!;
    expect(bands).toHaveLength(3);
    for (const band of bands) expect(band[0].length).toBeGreaterThan(0);
  });

  it("quebra explícita no meio da faixa fica, e começar por ela também", () => {
    const text = "\n" + "palavra ".repeat(300) + "\nfim\n\ncauda";
    const bands = tableRowBands([cell(text)], 11, 250)!;
    expect(bands.map((band) => textOf(band[0])).join("")).toBe(text);
  });

  it("palavra maior que uma faixa inteira é picada sem perder caractere", () => {
    const word = "x".repeat(30000);
    const bands = tableRowBands([cell(word)], 11, 250)!;
    expect(bands.length).toBeGreaterThan(2);
    expect(bands.map((band) => textOf(band[0])).join("")).toBe(word);
    for (const band of bands) expect(rowNeedsSplit(band, 11, 250)).toBe(false);
  });

  it("a palavra picada não separa um par substituto", () => {
    const word = "😀".repeat(6000);
    const bands = tableRowBands([cell(word)], 11, 250)!;
    expect(bands.length).toBeGreaterThan(2);
    for (const band of bands) {
      expect(textOf(band[0])).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/);
    }
    expect(bands.map((band) => textOf(band[0])).join("")).toBe(word);
  });

  it("fórmula pequena entre textos passa inteira, na ordem, para a faixa onde cai", () => {
    const row: RichText[] = [
      [
        { type: "text", text: "palavra ".repeat(400) },
        { type: "inlineMath", latex: "x+y=z" },
        { type: "text", text: " " + "palavra ".repeat(400) },
      ],
    ];
    const bands = tableRowBands(row, 11, 250)!;
    expect(bands.length).toBeGreaterThan(2);
    const atoms = bands.flatMap((band) => band[0]).filter((run) => run.type === "inlineMath");
    expect(atoms).toEqual([{ type: "inlineMath", latex: "x+y=z" }]);
    expect(bands.map((band) => textOf(band[0])).join("")).toBe(textOf(row[0]));
  });

  it("uma fórmula maior que a faixa é partida entre faixas, nos pontos seguros: nunca null (L11-1)", () => {
    const giant = Array.from({ length: 400 }, (_, i) => `a_${i}`).join("+");
    const bands = tableRowBands([[{ type: "inlineMath", latex: giant }], cell("x")], 12, 250)!;
    expect(bands).not.toBeNull();
    expect(bands.length).toBeGreaterThan(1);
    expect(bands.map((band) => latexOf(band[0])).join("")).toBe(giant);
    expect(bands.map((band) => textOf(band[1])).join("")).toBe("x");
    // o PDF re-parte cada pedaço emendado: a estimativa da faixa pode passar do alvo em uma ou
    // duas linhas, nunca a ponto de a faixa voltar a precisar de fatiamento
    for (const band of bands) expect(rowNeedsSplit(band, 12, 250)).toBe(false);
  });

  it("a fórmula partida não perde caractere em nenhuma coluna, corpo ou tamanho, de 76 a 2000", () => {
    for (const [columnPt, fontPt] of [[251, 12], [122, 12], [251, 16], [122, 16], [60, 16], [30, 10]] as const) {
      for (const n of [76, 144, 196, 308, 640, 1000, 2000]) {
        const spaced = Array.from({ length: Math.ceil(n / 6) }, (_, i) => `a_${i}`).join(" + ").slice(0, n);
        const solid = "\\frac{1}{2}".repeat(Math.ceil(n / 12)).slice(0, n);
        for (const latex of [spaced, solid]) {
          const row: RichText[] = [
            [{ type: "text", text: "palavra ".repeat(66) }, { type: "inlineMath", latex }],
            [{ type: "inlineMath", latex }],
          ];
          const bands = tableRowBands(row, fontPt, columnPt);
          const squash = (v: string) => v.replace(/\s/g, "");
          for (const c of [0, 1]) {
            expect(squash(bands.map((band) => latexOf(band[c])).join(""))).toBe(squash(latex));
          }
          for (const band of bands) expect(rowNeedsSplit(band, fontPt, columnPt)).toBe(false);
        }
      }
    }
  });

  it("nenhum corte cai dentro de um comando LaTeX", () => {
    const cmds = "\\sqrt{x}+\\frac{a}{b}+\\alpha".repeat(80);
    const bands = tableRowBands([[{ type: "inlineMath", latex: cmds }], cell("x")], 12, 122)!;
    const pieces = bands.map((band) => latexOf(band[0]));
    pieces.forEach((piece, i) => {
      expect(piece.endsWith("\\")).toBe(false);
      const next = pieces[i + 1];
      if (next !== undefined) expect(/[A-Za-z]$/.test(piece) && /^[A-Za-z]/.test(next)).toBe(false);
    });
    expect(bands.map((band) => latexOf(band[0])).join("")).toBe(cmds);
  });

  it("os pedaços de uma fórmula emendados numa faixa são UM nó, com os espaços do LaTeX de volta", () => {
    const spaced = Array.from({ length: 300 }, (_, i) => `a${i}b`).join(" + ");
    const bands = tableRowBands([[{ type: "inlineMath", latex: spaced }], cell("x")], 12, 122)!;
    expect(bands.length).toBeGreaterThan(2);
    for (const band of bands) {
      const nodes = band[0].filter((run) => run.type === "inlineMath");
      expect(nodes).toHaveLength(1);
      const latex = (nodes[0] as { latex: string }).latex;
      expect(latex).not.toMatch(/\u00a0/);
      // o trecho é contínuo no original, espaços e juntas incluídos: nada some nem se junta a mais
      expect(spaced).toContain(latex);
    }
  });

  it("duas fórmulas vizinhas na mesma célula não se fundem num nó só", () => {
    const a = Array.from({ length: 150 }, (_, i) => `a_${i}`).join("+");
    const b = Array.from({ length: 150 }, (_, i) => `b_${i}`).join("+");
    const bands = tableRowBands([[{ type: "inlineMath", latex: a }, { type: "inlineMath", latex: b }], cell("x")], 12, 122)!;
    const nodes = bands.flatMap((band) => band[0]).filter((run) => run.type === "inlineMath") as { latex: string }[];
    for (const node of nodes) expect(/a_/.test(node.latex) && /b_/.test(node.latex)).toBe(false);
    expect(nodes.map((n) => n.latex).join("")).toBe(a + b);
  });

  it("o pedaço de fórmula com espaço de junta conta o espaço na largura (pedaço de meia coluna)", () => {
    // 3 pedaços (5, 9 e 5 caracteres, os dois últimos com junta de espaço) na coluna de 104 pt: o
    // último, com o espaço, passa de meia coluna e ocupa a linha inteira; o texto vai para a 4ª
    const latex = "a0b + a1b + a2b + a3b";
    const h = estimatedRowHeightPt([[{ type: "inlineMath", latex }, { type: "text", text: "ab" }]], 12, 104);
    expect(h).toBeCloseTo(4 * 1.4 * mathPdfFontSizePt(12) + CELL_OVERHEAD_PT, 6);
  });

  it("depois de uma palavra mais larga que a coluna, a seguinte só entra se couber na sobra da última linha", () => {
    // 20 W a 10 pt = 333,5 pt em 100 pt: 4 linhas, a última com 33,5 pt usados de 100. A palavra
    // seguinte (15 x 7,5 x 1,15 = 129 pt) não cabe na sobra: abre outra linha e ocupa duas: 6 linhas
    expect(estimatedRowHeightPt([cell("W".repeat(20) + " bbbbbbbbbbbbbbb")], 10, 100)).toBeCloseTo(6 * 14 + CELL_OVERHEAD_PT, 6);
  });

  it("n pedaços exatos de uma coluna não viram n + 1 por arredondamento (a folga de 1e-9)", () => {
    // "abcdefgh" a 10 pt = 60 x 1,15 = 69 pt; 69 / 4,6 = 15,000000000000002 em ponto flutuante
    expect(estimatedRowHeightPt([cell("abcdefgh")], 10, 4.6)).toBeCloseTo(15 * 14 + CELL_OVERHEAD_PT, 6);
  });

  it("a largura útil da célula é a da folha menos o fio, dividida pelas colunas, menos recuo e fio de cada uma", () => {
    expect(tableCellColumnPt(1)).toBeCloseTo(PDF_CONTENT_WIDTH_PT - 0.75 - 6.75, 6);
    expect(tableCellColumnPt(2)).toBeCloseTo((PDF_CONTENT_WIDTH_PT - 0.75) / 2 - 6.75, 6);
    expect(tableCellColumnPt(4)).toBeCloseTo((PDF_CONTENT_WIDTH_PT - 0.75) / 4 - 6.75, 6);
  });

  it("a fórmula que cabe na faixa continua um nó só, o original", () => {
    const row: RichText[] = [
      [{ type: "text", text: "palavra ".repeat(400) }, { type: "inlineMath", latex: "a+b+c+d" }],
    ];
    const atoms = tableRowBands(row, 11, 250).flatMap((band) => band[0]).filter((run) => run.type === "inlineMath");
    expect(atoms).toEqual([{ type: "inlineMath", latex: "a+b+c+d" }]);
  });
});
