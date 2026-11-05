import { describe, it, expect } from "vitest";
import { lostFractions, questionOfFraction } from "./fractionGuard";

describe("lostFractions (N-I-001)", () => {
  it("flags (2 x + 1)/3 written back as 2x + 1/3, the real failure", () => {
    const lost = lostFractions("1) Dada f ( x )= (2 x + 1)/3 , calcule f(4).", "Dada f(x) = 2x + 1/3, calcule f(4).");
    expect(lost).toEqual([{ fraction: "(2 x + 1)/3", numerator: "2x+1" }]);
  });

  it("accepts the same fraction as LaTeX, as text, with or without spaces and brackets", () => {
    const input = "f(x)= (2 x + 1)/3 e x = (− b ± √ Δ)/(2 a)";
    expect(lostFractions(input, String.raw`$f(x) = \frac{2x + 1}{3}$ e $x = \frac{-b \pm \sqrt{\Delta}}{2a}$`)).toEqual([]);
    expect(lostFractions(input, "f(x) = (2x+1)/3 e x = (-b ± √Δ)/(2a)")).toEqual([]);
  });

  it("reads b² in the input and b^2 in the LaTeX as the same thing", () => {
    expect(lostFractions("(−b ± √(b² − 4ac))/2a", String.raw`\frac{-b \pm \sqrt{b^2 - 4ac}}{2a}`)).toEqual([]);
    expect(lostFractions("(a²b³)/(ab²)", String.raw`\frac{a^2 b^3}{a b^2}`)).toEqual([]);
  });

  it("reads \\dfrac, \\left( \\right) and \\cdot the way the PDF text has them", () => {
    expect(lostFractions("(2 · x + 1)/3", String.raw`\dfrac{2 \cdot x + 1}{3}`)).toEqual([]);
    expect(lostFractions("(a + b)/c", String.raw`\left(\frac{a+b}{c}\right)`)).toEqual([]);
  });

  it("does not look at fractions with a single token on each side", () => {
    expect(lostFractions("1/2 + 3/4", "um meio mais três quartos")).toEqual([]);
  });

  it("reports each lost fraction once and keeps the ones that survived", () => {
    const lost = lostFractions("(a + b)/c e (a + b)/c e (d − e)/f", "(a + b)/c e d − e/f");
    expect(lost.map((l) => l.fraction)).toEqual(["(d − e)/f"]);
  });

  it("reports a lost fraction once even when the input repeats it", () => {
    const lost = lostFractions("(d − e)/f e de novo (d − e)/f", "d − e/f");
    expect(lost.map((l) => l.fraction)).toEqual(["(d − e)/f"]);
  });

  it("has nothing to say when the input has no grouped fraction or the numerator is empty", () => {
    expect(lostFractions("sem fração", "qualquer coisa")).toEqual([]);
    expect(lostFractions("()/3", "x")).toEqual([]);
  });
});

describe("lostFractions: no false alarms (L9A-6)", () => {
  it("reads a fraction whose LaTeX has braces inside braces (exponents, roots)", () => {
    expect(lostFractions("Dado (x 2 + 1)/(x − 1)", String.raw`\frac{x^{2} + 1}{x - 1}`)).toEqual([]);
    expect(lostFractions("x = (− b ± √(b² − 4ac))/(2a)", String.raw`x = \frac{-b \pm \sqrt{b^{2} - 4ac}}{2a}`)).toEqual([]);
    expect(lostFractions("(a² + 1)/(b³ − 2)", String.raw`\dfrac{a^{2} + 1}{b^{3} - 2}`)).toEqual([]);
    // a fraction inside a fraction, each with nested braces
    expect(lostFractions("(1 + (x 2)/3)/(y − 1)", String.raw`\frac{1 + \frac{x^{2}}{3}}{y - 1}`)).toEqual([]);
  });

  it("still reports a real loss when the braces are nested", () => {
    expect(lostFractions("Dado (x 2 + 1)/(x − 1)", String.raw`\frac{x^{2} + 1}{x + 1}`).map((l) => l.fraction)).toEqual(["(x 2 + 1)/(x − 1)"]);
  });

  it("an unbalanced command is left as the model wrote it, never crashes", () => {
    expect(lostFractions("(a + b)/c", String.raw`\frac{a + b}{c`).map((l) => l.fraction)).toEqual(["(a + b)/c"]);
    expect(lostFractions("(a + b)/c", String.raw`\frac{a + b} c`).map((l) => l.fraction)).toEqual(["(a + b)/c"]);
    expect(lostFractions("(a + b)/c", String.raw`\frac`).map((l) => l.fraction)).toEqual(["(a + b)/c"]);
  });

  it("an unbalanced command does not stop the next, complete one from being read (L10 F5)", () => {
    expect(lostFractions("(a + b)/c", String.raw`\frac{x} y e depois \frac{a + b}{c}`)).toEqual([]);
  });

  it("a function call or a label before the slash is not a grouped fraction: f(x)/g(x)", () => {
    expect(lostFractions("Determine f(x)/g(x).", String.raw`Determine \frac{f(x)}{g(x)}.`)).toEqual([]);
    expect(lostFractions("Determine f(x)/g(x).", "Determine a razão entre f e g.")).toEqual([]);
  });

  it("a parenthesised label or a note is prose, not a fraction: (a)/(b), (Fonte: IBGE)/2020", () => {
    expect(lostFractions("Faça os itens (a)/(b).", "Faça os itens a e b.")).toEqual([]);
    expect(lostFractions("Tabela (Fonte: IBGE)/2020", "Tabela: Fonte IBGE 2020")).toEqual([]);
    expect(lostFractions("Data (12)/(03)", "Data 12 de março")).toEqual([]);
  });
});

describe("questionOfFraction", () => {
  it("finds the question whose text carries the numerator, or -1", () => {
    const lost = { fraction: "(2 x + 1)/3", numerator: "2x+1" };
    expect(questionOfFraction(lost, ["Calcule 5", "Dada f(x) = 2x + 1/3"])).toBe(1);
    expect(questionOfFraction(lost, ["nada"])).toBe(-1);
  });
});
