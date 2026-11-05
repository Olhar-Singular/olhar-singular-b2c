import { describe, it, expect } from "vitest";
import { pageTextFromItems, type PdfTextItem } from "./pdfTextLayout";
import type { FractionBar } from "./pdfFractionBars";

/** [str, x, y, height, width, hasEOL] exactly as pdf.js reported them for the real files. */
type Run = [string, number, number, number, number, boolean?];
const items = (runs: Run[]): PdfTextItem[] =>
  runs.map(([str, x, y, height, width, hasEOL]) => ({ str, x, y, height, width, hasEOL }));

/** The rule a real PDF draws between a numerator and a denominator: 3,5 pt under the numerator's baseline (N2, P05, P20). */
const barUnder = (x0: number, x1: number, numeratorY: number): FractionBar => ({ x0, x1, y: numeratorY - 3.5 });

/** N2-9ano-funcao-pdf.pdf, question 1: f(x) = (2x + 1)/3 (real runs). */
const N2_Q1: Run[] = [
  ["", 90.1, 655.6, 0, 0, true],
  ["1) Dada", 90.1, 655.6, 12, 38.3],
  [" ", 128.4, 655.6, 0, 3.4],
  ["f", 131.8, 656.5, 12, 3.3],
  [" ", 135.1, 656.5, 0, 2.9],
  ["(", 138, 656.5, 12, 4.1],
  [" ", 142.1, 656.5, 0, 1.9],
  ["x", 144, 656.5, 12, 5.3],
  [" ", 149.3, 656.5, 0, 1.7],
  [")=", 151, 656.5, 12, 13.6],
  [" ", 164.6, 656.5, 0, 1.6],
  ["2", 166.2, 663.4, 12, 6],
  [" ", 172.2, 663.4, 0, 2],
  ["x", 174.2, 663.4, 12, 5.3],
  [" ", 179.5, 663.4, 0, 1.2],
  ["+", 180.7, 663.4, 12, 7],
  ["1", 188.4, 663.4, 12, 6, true],
  ["3", 177.2, 648.3, 12, 6],
  [" ", 183.2, 648.3, 0, 12.5],
  [", calcule f(4).", 195.7, 655.6, 12, 63.9],
];

/** The Bhaskara line of the same file: a radical in the numerator, the denominator after an empty line-end run. */
const N2_Q2: Run[] = [
  ["2) Pela fórmula de Bhaskara,", 90.1, 614.5, 12, 139.5],
  [" ", 229.6, 614.5, 0, 3.7],
  ["x", 233.3, 615, 12, 5.3],
  ["=", 239.6, 615, 12, 9.5],
  [" ", 249.1, 615, 0, 1.5],
  ["− b ±", 250.6, 621.8, 12, 23.6],
  [" ", 274.2, 621.8, 0, 2.1],
  ["√", 275.9, 621.1, 14.7, 6.4],
  [" ", 282.3, 621.1, 0, 2.2],
  ["Δ", 284.1, 621.8, 12, 7],
  ["", 264.1, 606.7, 0, 0, true],
  ["2", 264.1, 606.7, 12, 6],
  [" ", 270.1, 606.7, 0, 1.5],
  ["a", 271.6, 606.7, 12, 6],
  [" ", 277.6, 606.7, 0, 14.9],
  [", determine as raízes de", 292.6, 614.5, 12, 112.2],
];

describe("pageTextFromItems: stacked fractions (N-I-001)", () => {
  it("keeps the grouping of a composite numerator: (2x + 1)/3, not 2x + 1/3", () => {
    const text = pageTextFromItems(items(N2_Q1), [barUnder(166, 195, 663.4)]);
    expect(text).toContain("(2 x + 1)/3 , calcule f(4).");
    expect(text).not.toContain("\n3");
  });

  it("groups a radical numerator and a composite denominator", () => {
    expect(pageTextFromItems(items(N2_Q2), [barUnder(250, 293, 621.8)])).toContain("(− b ± √ Δ)/(2 a) , determine as raízes de");
  });

  it("reads two simple fractions on one line as 1/2 + 3/4", () => {
    const text = pageTextFromItems(
      items([
        ["3) Some", 90.1, 591.9, 11, 41.4],
        [" ", 131.5, 591.9, 0, 4],
        ["1", 135.6, 599.5, 12, 6, true],
        ["2", 135.6, 584.5, 12, 6],
        [" ", 141.6, 584.5, 0, 1.8],
        ["+", 143.4, 592.7, 12, 7],
        [" ", 150.4, 592.7, 0, 2.3],
        ["3", 152.7, 599.5, 12, 6, true],
        ["4", 152.8, 584.5, 12, 6],
        [" ", 158.8, 584.5, 0, 4.7],
        ["e simplifique.", 163.4, 591.9, 11, 71],
      ]),
      [barUnder(135, 142, 599.5), barUnder(152, 159, 599.5)],
    );
    expect(text.replace(/\s+/g, " ")).toBe("3) Some 1/2 + 3/4 e simplifique.");
  });

  it("starts a fraction that opens the line and breaks the line after one that ends it", () => {
    const text = pageTextFromItems(
      items([
        ["Texto", 90, 700, 12, 30],
        ["x", 100, 640, 12, 5],
        ["+", 106, 640, 12, 7],
        ["y", 114, 640, 12, 5, true],
        ["z", 108, 625, 12, 5],
        ["= 4", 120, 632.5, 12, 15, true],
        ["Outra", 90, 590, 12, 30],
      ]),
      [barUnder(99, 120, 640)],
    );
    expect(text).toBe("Texto\n(x + y)/z = 4\nOutra");
  });

  it("a centred pair on a line of its own is a fraction only when a bar is drawn between the lines", () => {
    const base: Run[] = [["Margem", 90, 700, 12, 40]];
    const pair: Run[] = [...base, ["a", 240, 650, 12, 5, true], ["b", 240, 635, 12, 5]];
    const bar: FractionBar = { x0: 236, x1: 249, y: 642.5 };
    expect(pageTextFromItems(items(pair), [bar])).toBe("Margem\na/b");
    // no bar signal: leave the lines as they came (L9A-1: when in doubt, do not group)
    expect(pageTextFromItems(items(pair))).toBe("Margem a\nb");
    const leftAligned = pageTextFromItems(items([...base, ["a", 90, 650, 12, 5, true], ["b", 90, 635, 12, 5]]), [
      { x0: 86, x1: 99, y: 642.5 },
    ]);
    expect(leftAligned).toBe("Margem a\nb");
  });

  it("a bar that does not belong to the pair does not make it a fraction", () => {
    const pair: Run[] = [["Margem", 90, 700, 12, 40], ["a", 240, 650, 12, 5, true], ["b", 240, 635, 12, 5]];
    const text = (bars: FractionBar[]) => pageTextFromItems(items(pair), bars);
    expect(text([{ x0: 236, x1: 249, y: 660 }])).toBe("Margem a\nb"); // above the numerator
    expect(text([{ x0: 236, x1: 249, y: 630 }])).toBe("Margem a\nb"); // under the denominator
    expect(text([{ x0: 100, x1: 400, y: 642.5 }])).toBe("Margem a\nb"); // a long rule: a table border
    expect(text([{ x0: 100, x1: 130, y: 642.5 }])).toBe("Margem a\nb"); // elsewhere on the page
  });

  it("the bar has to span both ends of the pair, and the pair has to share a centre (L10 H3, H4, H8)", () => {
    const pair: Run[] = [["Margem", 90, 700, 12, 40], ["a", 240, 650, 12, 5, true], ["b", 240, 635, 12, 5]];
    const text = (bars: FractionBar[]) => pageTextFromItems(items(pair), bars);
    expect(text([{ x0: 236, x1: 249, y: 642.5 }])).toBe("Margem\na/b");
    expect(text([{ x0: 250, x1: 262, y: 642.5 }])).toBe("Margem a\nb"); // starts after the pair's left end (H3)
    expect(text([{ x0: 225, x1: 235, y: 642.5 }])).toBe("Margem a\nb"); // ends before the pair's right end (H4)
    const offCentre = pageTextFromItems(
      items([["Margem", 90, 700, 12, 40], ["a", 240, 650, 12, 5, true], ["b", 241.5, 635, 12, 5]]),
      [{ x0: 236, x1: 252, y: 642.5 }],
    );
    expect(offCentre).toBe("Margem a\nb"); // numerator and denominator are not centred on each other (H8)
  });

  it("a true isolated fraction (x + 1 over x − 1) with its bar is grouped", () => {
    const text = pageTextFromItems(
      items([["Margem", 90, 700, 12, 40], ["x + 1", 230, 650, 12, 26, true], ["x − 1", 230, 635, 12, 26]]),
      [{ x0: 229, x1: 257, y: 642.5 }],
    );
    expect(text).toBe("Margem\n(x + 1)/(x − 1)");
  });

  it("text with a word or a (A) label is never a fraction, even with a rule between the lines", () => {
    const rule: FractionBar[] = [{ x0: 200, x1: 330, y: 642.5 }];
    const words = pageTextFromItems(
      items([["Margem", 90, 700, 12, 40], ["ESCOLA", 240, 650, 12, 60, true], ["MUNICIPAL", 240, 635, 12, 60]]),
      rule,
    );
    expect(words).toBe("Margem ESCOLA\nMUNICIPAL");
    const labels = pageTextFromItems(
      items([["Margem", 90, 700, 12, 40], ["(A) 12", 240, 650, 12, 30, true], ["(B) 15", 240, 635, 12, 30]]),
      [{ x0: 238, x1: 272, y: 642.5 }],
    );
    expect(labels).toBe("Margem (A) 12\n(B) 15");
    const bare = pageTextFromItems(
      items([["Margem", 90, 700, 12, 40], ["A) 12", 240, 650, 12, 30, true], ["B) 15", 240, 635, 12, 30]]),
      [{ x0: 238, x1: 272, y: 642.5 }],
    );
    expect(bare).toBe("Margem A) 12\nB) 15");
  });

  it("does not turn the synthetic page shapes of the review into fractions (L9A-1, ac-sint)", () => {
    const W = (str: string, h: number) => +(str.length * 0.52 * h).toFixed(1);
    const run = (str: string, x: number, y: number, h = 12): Run[] => [
      [str, x, y, h, W(str, h)],
      ["", x + W(str, h), y, 0, 0, true],
    ];
    const body = (n: number, y0: number): Run[] =>
      Array.from({ length: n }, (_, k) => run(`Texto de enunciado corrido numero ${k + 1} da prova`, 40, y0 - k * 15)).flat();
    const lines = (runs: Run[]) => pageTextFromItems(items(runs)).split("\n").map((line) => line.trim());
    const centre = (str: string, h = 12) => 297.6 - W(str, h) / 2;

    expect(lines([...run("ESCOLA MUNICIPAL", centre("ESCOLA MUNICIPAL"), 800), ...run("JOÃO DA SILVA", centre("JOÃO DA SILVA"), 786), ...body(5, 740)]).slice(0, 2)).toEqual([
      "ESCOLA MUNICIPAL",
      "JOÃO DA SILVA",
    ]);
    expect(lines([...run("Avaliação", centre("Avaliação", 14), 800, 14), ...run("1º Bimestre", centre("1º Bimestre", 14), 783, 14), ...body(5, 740)]).slice(0, 2)).toEqual([
      "Avaliação",
      "1º Bimestre",
    ]);
    expect(lines([...body(2, 760), ...run("A) 12 cm", 90, 730), ...run("B) 15 cm", 90, 715), ...run("C) 18 cm", 90, 700), ...run("D) 20 cm", 90, 685), ...body(2, 660)])).toEqual(
      expect.arrayContaining(["A) 12 cm", "B) 15 cm", "C) 18 cm", "D) 20 cm"]),
    );
    expect(lines([...body(2, 760), ...run("A) 2     B) 4", 90, 730), ...run("C) 6     D) 8", 90, 715), ...body(2, 690)])).toEqual(
      expect.arrayContaining(["A) 2     B) 4", "C) 6     D) 8"]),
    );
    expect(lines([...body(2, 760), ...run("347", 100, 730), ...run("256", 100, 715), ...body(2, 690)])).toEqual(expect.arrayContaining(["347", "256"]));
    expect(lines([...body(2, 760), ...run("  347", 100, 730), ...run("+ 256", 100, 715), ...run("-----", 100, 700), ...body(2, 680)])).toEqual(
      expect.arrayContaining(["347", "+ 256"]),
    );
    expect(lines([...body(2, 760), ...run("Nota", 200, 730), ...run("8,5", 205, 715), ...body(2, 690)])).toEqual(expect.arrayContaining(["Nota", "8,5"]));
  });

  // L9A-2: the page's most common run height is 16.9 (math in Courier), so a 12 pt text line
  // right under a math line was taken for a script of it and glued to it.
  describe("formula-dominated pages (math runs taller than the prose)", () => {
    /** 317ca9-stem-027.pdf, page 1, last question: the pmatrix line and the "fim" under it (real runs). */
    const PMATRIX_PAGE: Run[] = [
      ["1.", 40, 786.7, 12, 10],
      ["\\Delta", 128.7, 786.7, 16.9, 60.7],
      ["= b^2 -", 199.6, 786.7, 16.9, 70.9],
      ["4ac", 280.5, 786.7, 16.9, 30.4],
      ["fim", 314.2, 786.7, 12, 16],
      ["", 62.7, 65.4, 0, 0, true],
      ["C = \\begin{pmatrix} 2", 62.7, 65.4, 16.9, 212.6],
      ["&", 285.4, 65.4, 16.9, 10.1],
      ["3", 305.6, 65.4, 16.9, 10.1],
      ["\\end{pmatrix}", 417, 65.4, 16.9, 131.6],
      ["", 62.7, 52.9, 0, 0, true],
      ["fim", 62.7, 52.9, 12, 16],
    ];
    /** f8d410-golden.pdf, page 3: the aligned block and the "(fim da frase)" line under it (real runs). */
    const ALIGNED_PAGE: Run[] = [
      ["AL07", 40, 536.5, 12, 28],
      ["\\begin{aligned}", 74.7, 536.5, 16.9, 151.8],
      ["2x+y&=7\\\\ x-y&=2", 236.6, 536.5, 16.9, 162],
      ["\\end{aligned}-", 408.7, 536.5, 16.9, 141.7],
      ["", 40, 524.1, 0, 0, true],
      ["(fim da frase)", 40, 524.1, 12, 70.6, true],
      ["x", 60, 490.9, 16.9, 10],
      ["y", 80, 490.9, 16.9, 10],
    ];

    it("keeps the line under a math line as its own line (317ca9 p1, f8d410 p3)", () => {
      expect(pageTextFromItems(items(PMATRIX_PAGE))).toContain("\\end{pmatrix}\nfim");
      expect(pageTextFromItems(items(ALIGNED_PAGE))).toContain("\\end{aligned}-\n(fim da frase)");
    });

    it("still keeps a real script (smaller and close to the baseline) on the row of its base", () => {
      const text = pageTextFromItems(
        items([
          ["x", 100, 700, 16.9, 10],
          ["2", 110, 706, 9, 5],
          ["+ 1", 116, 700, 16.9, 25, true],
          ["a", 100, 670, 16.9, 10],
          ["b", 110, 670, 16.9, 10],
        ]),
      );
      expect(text.split("\n")[0].replace(/\s+/g, " ")).toBe("x 2 + 1");
    });
  });

  // L9A-9: each geometry condition of a stacked pair has a case that only it rejects.
  describe("what makes two lines a stacked pair (one condition at a time)", () => {
    const LEFT: Run = ["Dada", 90, 700, 12, 30];
    const text = (runs: Run[], bars: FractionBar[] = []) => pageTextFromItems(items(runs), bars);

    it("needs the lines about one line apart: 0.8 to 1.9 times the body height", () => {
      const at = (gap: number) =>
        text([LEFT, ["a", 130, 700 + gap / 2, 12, 6, true], ["b", 130, 700 - gap / 2, 12, 6]], [barUnder(129, 137, 700 + gap / 2)]);
      expect(at(8)).toBe("Dada a\nb"); // too close: a line and its subscript row
      expect(at(10)).toBe("Dada a/b");
      expect(at(22)).toBe("Dada a/b");
      expect(at(24)).toBe("Dada a\nb"); // too far: two lines of text
    });

    it("needs the two to overlap, even when their centres are within the 2 pt floor", () => {
      const bar = [barUnder(129, 137, 706)];
      expect(text([LEFT, ["1", 130, 706, 12, 4, true], ["2", 132, 694, 12, 4]], bar)).toBe("Dada 1\n2");
      expect(text([LEFT, ["1", 130, 706, 12, 4, true], ["2", 130, 694, 12, 4]], bar)).toBe("Dada 1/2");
    });

    it("needs them centred on each other: a short line under the start of a longer one is not a fraction", () => {
      expect(text([LEFT, ["abcd efg", 130, 706, 12, 40, true], ["xy", 130, 694, 12, 15]], [barUnder(129, 171, 706)])).toBe(
        "Dada abcd efg\nxy",
      );
    });

    it("needs each part to be short: a long tight line is a sentence, not a numerator", () => {
      expect(
        text([LEFT, ["uma linha comprida de texto corrido", 130, 706, 12, 200, true], ["y", 227, 694, 12, 6]], [barUnder(129, 331, 706)]),
      ).toBe(
        "Dada uma linha comprida de texto corrido\ny",
      );
    });

    it("needs each part to be tight: a gap between its words is a column, not a numerator", () => {
      expect(text([LEFT, ["a", 130, 706, 12, 5], ["b", 175, 706, 12, 5, true], ["c", 150, 694, 12, 5]], [barUnder(129, 181, 706)])).toBe(
        "Dada a b\nc",
      );
      expect(text([LEFT, ["a", 130, 706, 12, 5], ["b", 150, 706, 12, 5, true], ["c", 140, 694, 12, 5]], [barUnder(129, 156, 706)])).toBe(
        "Dada (a b)/c",
      );
    });

    it("needs the line it interrupts to be close: a faraway word is not the left of the fraction", () => {
      const bar = [barUnder(129, 137, 706)];
      // too far to be the left of the pair: with its rule the pair is an isolated fraction on its own line
      expect(text([["Dada", 20, 700, 12, 30], ["a", 130, 706, 12, 6, true], ["b", 130, 694, 12, 6]], bar)).toBe("Dada\na/b");
      expect(text([["Dada", 20, 700, 12, 30], ["a", 130, 706, 12, 6, true], ["b", 130, 694, 12, 6]])).toBe("Dada a\nb");
      const faraway: Run[] = [["Margem", 40, 760, 12, 40, true], ["a", 130, 706, 12, 6, true], ["b", 130, 694, 12, 6], ["fim", 300, 700, 12, 15]];
      expect(text(faraway)).toBe("Margem\na\nb fim");
      expect(text(faraway, bar)).toBe("Margem\na/b\nfim"); // with its rule, an isolated fraction that "fim" does not touch
      expect(
        text([["Dada", 90, 700, 12, 30], ["a", 130, 706, 12, 6, true], ["b", 130, 694, 12, 6], ["fim", 142, 700, 12, 15]], bar),
      ).toBe("Dada a/b fim");
    });

    it("keeps a script of the numerator inside the numerator: (x 2 + 1)/(x − 1)", () => {
      const stacked = text([
        LEFT,
        ["x", 130, 706, 12, 6],
        ["2", 136, 712, 7, 4],
        ["+ 1", 141, 706, 12, 14, true],
        ["x − 1", 130, 694, 12, 25],
      ], [barUnder(129, 156, 706)]);
      expect(stacked).toBe("Dada (x 2 + 1)/(x − 1)");
    });
  });

  // L9BC-4: the neighbour on the interrupted line is not enough, the rule between the lines is.
  it("a table cell of two lines beside a one-line cell is not a fraction without a rule (L9BC-4)", () => {
    const cell: Run[] = [
      ["Margem", 40, 760, 12, 40, true],
      ["12 kg", 124, 700, 12, 30, true],
      ["bruto", 126, 686.5, 12, 26],
      ["R$ 50", 160, 693, 12, 26, true],
    ];
    expect(pageTextFromItems(items(cell))).toBe("Margem\n12 kg\nbruto R$ 50");
    expect(pageTextFromItems(items(cell), [{ x0: 20, x1: 500, y: 680 }])).toBe("Margem\n12 kg\nbruto R$ 50");
    // with the rule drawn between the lines it is the fraction again
    expect(pageTextFromItems(items(cell), [barUnder(123, 156, 700)])).toContain("(12 kg)/bruto");
  });

  it("a real fraction beside text but with no rule readable is left as two lines, never a guessed 2/3 (L9BC-4)", () => {
    const runs: Run[] = [
      ["x =", 60, 693, 12, 15],
      ["2", 100, 700, 12, 6, true],
      ["3", 100, 686.5, 12, 6],
      ["+ 1", 112, 693, 12, 15, true],
    ];
    expect(pageTextFromItems(items(runs))).not.toContain("2/3");
    expect(pageTextFromItems(items(runs), [barUnder(99, 107, 700)])).toContain("2/3");
  });

  // L9BC-3: an underline and a fraction bar are the same thin stroke; the underline hugs the text above it.
  it("a number underlined above another number is not a fraction (L9BC-3)", () => {
    const runs: Run[] = [["Observe", 90, 760, 12, 40, true], ["120", 300, 700, 12, 18, true], ["480", 300, 685, 12, 18]];
    const underline: FractionBar = { x0: 296, x1: 316, y: 700 - 1.3 };
    const fractionBar: FractionBar = { x0: 296, x1: 316, y: 700 - 3.5 };
    expect(pageTextFromItems(items(runs), [underline])).toBe("Observe\n120\n480");
    expect(pageTextFromItems(items(runs), [fractionBar])).toBe("Observe\n120/480");
  });

  it("the underline limit is 0,2 em under the numerator's baseline (L9BC-3)", () => {
    const runs: Run[] = [["Observe", 90, 760, 12, 40, true], ["120", 300, 700, 12, 18, true], ["480", 300, 685, 12, 18]];
    const at = (drop: number) => pageTextFromItems(items(runs), [{ x0: 296, x1: 316, y: 700 - drop }]);
    expect(at(2.3)).toBe("Observe\n120\n480");
    expect(at(2.5)).toBe("Observe\n120/480");
  });

  it("a lone pair that is long is not taken as a fraction", () => {
    const text = pageTextFromItems(
      items([
        ["Margem", 90, 700, 12, 40],
        ["uma frase bem comprida", 200, 650, 12, 100, true],
        ["outra frase também longa", 188, 635, 12, 124],
      ]),
    );
    expect(text).toBe("Margem uma frase bem comprida\noutra frase também longa");
  });

  it("does not touch ordinary lines: wrong centre, wrong gap or no overlap", () => {
    const wrongCentre = pageTextFromItems(
      items([["Aqui", 90, 700, 12, 30], ["linha um", 100, 650, 12, 40, true], ["dois", 160, 636, 12, 20]]),
    );
    expect(wrongCentre).toBe("Aqui linha um\ndois");
    const farApart = pageTextFromItems(
      items([["Aqui", 90, 700, 12, 30], ["a", 240, 650, 12, 5, true], ["b", 240, 600, 12, 5]]),
    );
    expect(farApart).toBe("Aqui a\nb");
    const empty = pageTextFromItems(items([["a", 240, 650, 12, 0, true], ["b", 240, 636, 12, 0]]));
    expect(empty).toBe("a\nb");
  });

  it("leaves the rows of a table alone (wide rows with column gaps)", () => {
    const table = pageTextFromItems(
      items([
        ["A tabela:", 90, 700, 12, 50],
        ["Produto", 90, 660, 12, 40],
        ["Segunda", 200, 660, 12, 40],
        ["Terça", 300, 660, 12, 30],
        ["Quarta", 400, 660, 12, 34, true],
        ["Sanduíches", 90, 646, 12, 55],
        ["120", 210, 646, 12, 16],
        ["95", 305, 646, 12, 12],
        ["140", 405, 646, 12, 16, true],
        ["Sucos", 90, 632, 12, 30],
        ["80", 210, 632, 12, 12],
        ["60", 305, 632, 12, 12],
        ["75", 405, 632, 12, 12, true],
      ]),
    );
    expect(table).toContain("Produto Segunda Terça Quarta\nSanduíches 120 95 140\nSucos 80 60 75");
  });

  it("says a nested stack was not read instead of guessing where the bars are", () => {
    const text = pageTextFromItems(
      items([
        ["6) Simplifique", 90, 660, 11, 70],
        ["x + 1", 175, 674, 12, 25],
        ["2", 185, 660, 12, 6],
        ["3", 185, 646, 12, 6],
        [".", 215, 660, 11, 3, true],
      ]),
    );
    expect(text).toBe("6) Simplifique [fórmula não lida] .");
  });

  it("does not mistake three stacked table-like lines for a nested fraction", () => {
    const text = pageTextFromItems(
      items([
        ["a", 240, 650, 12, 5, true],
        ["b", 240, 636, 12, 5, true],
        ["c", 240, 622, 12, 5, true],
      ]),
    );
    expect(text).toBe("a\nb\nc");
  });

  it("handles empty input, blank runs before and after the text, and scripts on the row", () => {
    expect(pageTextFromItems([])).toBe("");
    expect(pageTextFromItems(items([[" ", 10, 700, 0, 3]]))).toBe("");
    expect(pageTextFromItems(items([["a", 20, 700, 12, 5], [" ", 30, 650, 0, 3]]))).toBe("a");
    // a nested stack that opens the page
    expect(
      pageTextFromItems(items([["x + 1", 175, 674, 12, 25], ["2", 185, 660, 12, 6], ["3", 185, 646, 12, 6], [".", 215, 660, 11, 3]])),
    ).toBe("[fórmula não lida] .");
    expect(pageTextFromItems(items([[" ", 10, 700, 0, 3], ["a", 20, 700, 12, 5], ["2", 26, 706, 7, 4], [" ", 30, 700, 0, 3]]))).toBe("a 2");
  });
});
