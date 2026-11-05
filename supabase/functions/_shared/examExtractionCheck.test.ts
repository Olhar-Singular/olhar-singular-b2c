import { describe, it, expect } from "vitest";
import {
  checkExtraction,
  hasCheckableInput,
  type ExtractionIssue,
} from "./examExtractionCheck";
import { UNREAD_FORMULA, UNREAD_IMAGE } from "../../../src/lib/domain/unreadMarker";

// Casos reais da bateria de 11/2026 (docs-gerados/E02, E01, E06, E10, E12): o texto que o
// cliente mandou e o que a extração devolveu.

const E02_INPUT = `9º ano: sistema, raiz, Pitágoras, 2º grau

1) Resolva o sistema:





2) Calcule .

3) Simplifique .

4) Um triângulo retângulo tem catetos de 6 cm e 8 cm. Calcule a hipotenusa.

5) Resolva a equação .

6) Desenvolvendo , obtemos:

(a)

(b)

(c)

(d)

7) Calcule o discriminante (Δ) da equação .

8) Racionalize o denominador de .
`;

const E02_INVENTED = [
  { text: "Resolva o sistema:\nx+y=5\nx-y=1" },
  { text: "Calcule 3² + 4²." },
  { text: "Simplifique √8." },
  { text: "Um triângulo retângulo tem catetos de 6 cm e 8 cm. Calcule a hipotenusa." },
  { text: "Resolva a equação x²-5x+6=0." },
  { text: "Desenvolvendo (x+2)², obtemos:", options: ["x²+4x+4", "x²+2x+4", "x²+4", "x²+2x"] },
  { text: "Calcule o discriminante (Δ) da equação x²+2x+1=0." },
  { text: "Racionalize o denominador de 1/√2." },
];

const E01_INPUT = `--- Página 1 ---
9º ano: sistema, raiz, Pitágoras, 2º grau
1) Resolva o sistema:
x   +   y = 10
x − y = 2
2) Calcule   √ 144 + √ 25 .
3) Simplifique   √ 50 .
4) Um triângulo retângulo tem catetos de 6 cm e 8 cm. Calcule a hipotenusa.
5) Resolva a equação   x 2   − 7   x   + 12 = 0 .
6) Desenvolvendo   (   x   + 3   ) 2 , obtemos:
(a)   x 2 + 9
(b)   x 2 + 6   x   + 9
(c)   x 2 + 3   x   + 9
(d)   x 2 + 6   x   + 6
7) Calcule o discriminante (Δ) da equação   2   x 2 + 3   x − 5 = 0 .
8) Racionalize o denominador de   1
√ 3   .`;

const E01_RESULT = [
  { text: "Resolva o sistema:\nx   +   y = 10\nx − y = 2" },
  { text: "Calcule   √ 144 + √ 25 ." },
  { text: "Simplifique   √ 50 ." },
  { text: "Um triângulo retângulo tem catetos de 6 cm e 8 cm. Calcule a hipotenusa." },
  { text: "Resolva a equação x² − 7x + 12 = 0." },
  { text: "Desenvolvendo (x + 3)², obtemos:", options: ["x² + 9", "x² + 6x + 9", "x² + 3x + 9", "x² + 6x + 6"] },
  { text: "Calcule o discriminante (Δ) da equação 2x² + 3x − 5 = 0." },
  { text: "Racionalize o denominador de 1/√3." },
];

const byQuestion = (issues: ExtractionIssue[]) => issues.map((i) => `${i.question}:${i.kind}`);

describe("checkExtraction: valor inventado (C-03)", () => {
  it("E02: o texto sem as equações + a extração que as inventou = todas suspeitas, menos a que existe", () => {
    const issues = checkExtraction(E02_INPUT, E02_INVENTED);
    expect(byQuestion(issues)).toEqual([
      "1:invented",
      "2:invented",
      "3:invented",
      "5:invented",
      "6:invented",
      "7:invented",
      "8:invented",
    ]);
    expect(issues[0].items).toContain("x+y=5");
    expect(issues[1].items.join(" ")).toMatch(/3²|3\^2|3/);
    // a questão 4 (6 cm e 8 cm) existe no texto e não é apontada
    expect(issues.some((i) => i.question === 4)).toBe(false);
  });

  it("PDF com expoente solto no texto (x 2) e a extração com x²: nenhuma suspeita", () => {
    expect(checkExtraction(E01_INPUT, E01_RESULT)).toEqual([]);
  });

  it("subscritos Unicode, frações e decimais com vírgula conferem", () => {
    const input = "4) Em uma PA, a₁ = 3 e a razão é r = 4. Calcule a₁₀.\n3) Quanto é 0,75 + 1,2?\n8) 1000 mL em 3500 mL, 3/8";
    const result = [
      { text: "Em uma PA, a₁ = 3 e a razão é r = 4. Calcule a₁₀." },
      { text: "Quanto é 0.75 + 1.2?" },
      { text: "1.000 mL em 3.500 mL, 3/8" },
    ];
    expect(checkExtraction(input, result)).toEqual([]);
  });

  it("^ do nosso DOCX, raiz sqrt(...) e LaTeX do modelo conferem entre si", () => {
    const input = "5) Resolva x^2 − 7x + 12 = 0 e sqrt(144) + 1/(sqrt(3))";
    const result = [{ text: "Resolva $x^{2} - 7x + 12 = 0$ e √144 + 1/√3" }];
    expect(checkExtraction(input, result)).toEqual([]);
  });

  it("tira o rótulo de questão e de alternativa dos dois lados antes de comparar", () => {
    const input = "Questão 7) Qual o valor de 12?\n(a) 15\n(b) 18";
    const result = [{ text: "7) Qual o valor de 12?", options: ["a) 15", "b) 18"] }];
    expect(checkExtraction(input, result)).toEqual([]);
  });

  it("número que não existe na entrada, na alternativa", () => {
    const issues = checkExtraction("1) Quanto é 12 + 3?\n(a) 15\n(b) 14", [
      { text: "Quanto é 12 + 3?", options: ["15", "17"] },
    ]);
    expect(issues).toEqual([
      { question: 1, kind: "invented", items: ["17"], of: 1, excerpt: "Quanto é 12 + 3?" },
    ]);
  });

  it("entrada de imagem (sem texto aproveitável) não é conferida: não há com o que comparar", () => {
    expect(hasCheckableInput("")).toBe(false);
    expect(hasCheckableInput("--- Página 1 ---\n\n")).toBe(false);
    expect(hasCheckableInput("--- Página 1 ---\n1) Quanto é 2 + 2?")).toBe(true);
    expect(checkExtraction("--- Página 1 ---", [{ text: "Calcule 7 + 9" }])).toEqual([]);
  });
});

describe("checkExtraction: o que a leitura não alcançou", () => {
  it("marcador de 'não lida' que sobrou na questão é apontado, sem inventar valor", () => {
    const issues = checkExtraction(`2) Calcule ${UNREAD_FORMULA}.`, [{ text: `Calcule ${UNREAD_FORMULA}.` }]);
    expect(issues).toEqual([
      { question: 1, kind: "unread", items: [UNREAD_FORMULA], of: 1, excerpt: `Calcule ${UNREAD_FORMULA}.` },
    ]);
  });

  it("marcador na alternativa também conta", () => {
    const issues = checkExtraction(`1) Escolha\n(a) ${UNREAD_IMAGE}\n(b) 2`, [
      { text: "Escolha", options: [UNREAD_IMAGE, "2"] },
    ]);
    expect(byQuestion(issues)).toEqual(["1:unread"]);
  });

  it("a IA completou no lugar do marcador: marcador a menos na saída do que na entrada", () => {
    const input = `1) Calcule ${UNREAD_FORMULA}.\n2) Simplifique ${UNREAD_FORMULA}.`;
    const issues = checkExtraction(input, [{ text: `Calcule ${UNREAD_FORMULA}.` }, { text: "Simplifique 9." }]);
    expect(issues.map((i) => i.kind)).toContain("lost_marker");
    expect(issues.find((i) => i.kind === "lost_marker")?.question).toBeNull();
  });

  it("verbo de comando sem objeto na saída (a lacuna do DOCX) é apontado como lacuna", () => {
    const issues = checkExtraction("1) Calcule .\n2) Quanto é 2 + 2?", [
      { text: "Calcule ." },
      { text: "Quanto é 2 + 2?" },
    ]);
    expect(issues).toEqual([
      { question: 1, kind: "gap", items: ["Calcule ."], of: 2, excerpt: "Calcule ." },
    ]);
  });

  it("'Resolva:' que apresenta os itens não é lacuna", () => {
    expect(checkExtraction("1) Resolva:\na) 2 + 2", [{ text: "Resolva:\na) 2 + 2" }])).toEqual([]);
  });

  it("uma questão com mais de um defeito sai com um item por tipo", () => {
    const input = "1) Calcule .\n2) outra";
    const issues = checkExtraction(input, [{ text: "Calcule . depois 99" }, { text: "outra" }]);
    expect(issues.filter((i) => i.question === 1).map((i) => i.kind).sort()).toEqual(["gap", "invented"]);
  });

  it("fração vulgar e fração escrita conferem entre si", () => {
    expect(checkExtraction("1) Quanto é ½ + ¼ + ¾ + ⅓ + ⅔ de 12?", [{ text: "Quanto é 1/2 + 1/4 + 3/4 + 1/3 + 2/3 de 12?" }])).toEqual([]);
  });

  it("tolera saída sem texto ou sem questões", () => {
    expect(checkExtraction("1) Quanto é 2 + 2?", [])).toEqual([]);
    expect(checkExtraction("1) Quanto é 2 + 2?", [{ text: undefined as unknown as string }])).toEqual([]);
  });
});

describe("checkExtraction: nunca derruba a requisição (F2, lote 5b)", () => {
  it("texto e alternativas que não são string não lançam", () => {
    const questions = [
      { text: { a: 1 }, options: [5, null, "x"] },
      { text: undefined, options: "não é lista" },
      null,
      { text: 42 },
    ] as unknown as Parameters<typeof checkExtraction>[1];
    expect(() => checkExtraction("1) Quanto é 12 + 3?", questions)).not.toThrow();
    expect(() => checkExtraction(undefined as unknown as string, questions)).not.toThrow();
    expect(() => checkExtraction("1) Quanto é 12 + 3?", undefined as never)).not.toThrow();
  });

  it("alternativa numérica 10, 20, 30 é lida como número, sem item NaN", () => {
    const issues = checkExtraction("1) Quanto é 10 + 20?\n(a) 10 (b) 20 (c) 30", [
      { text: "Quanto é 10 + 20?", options: [10, 20, 30] as unknown as string[] },
    ]);
    expect(issues).toEqual([]);
  });
});

describe("checkExtraction: mesma coisa escrita de outro jeito não é invenção (F3, lote 5b)", () => {
  const same = (input: string, output: string) =>
    expect(checkExtraction(`1) ${input}`, [{ text: output }])).toEqual([]);

  it.each([
    ["10^3 e 24", "10³ e 24"],
    ["10³ e 24", "10^3 e 24"],
    ["10^3", "10^{3}"],
    ["2^10 + 1", "2¹⁰ + 1"],
    ["2¹⁰ + 1", "2^10 + 1"],
    ["10^(-3) m", "10⁻³ m"],
    ["10⁻³ m", "10^(-3) m"],
    ["3^(n+1) = 9", "3ⁿ⁺¹ = 9"],
    ["3ⁿ⁺¹ = 9", "3^(n+1) = 9"],
    ["H_(2)O e CO_(2)", "H₂O e CO₂"],
    ["a^5 · a^2", "a⁵ · a²"],
    ["Pague R$ 1.200,50 hoje", "Pague R$ 1200,50 hoje"],
    ["Pague R$ 1200,50 hoje", "Pague R$ 1.200,50 hoje"],
    ["Pague R$ 1.200,50 hoje", "Pague R$ 1.200,50 hoje"],
    ["Calcule 3 x 4 = 12", "Calcule 3 × 4 = 12"],
    ["Calcule 3 × 4 = 12", "Calcule 3 x 4 = 12"],
    ["Se x >= 3 então", "Se x ≥ 3 então"],
    ["Se x ≥ 3 então", "Se x >= 3 então"],
    ["Se x <= 3 então", "Se x ≤ 3 então"],
    ["π ≈ 3,14", "π = 3,14"],
    ["π = 3,14", "π ≈ 3,14"],
    ["Some 1/2 + 3", "Some $\\frac{1}{2}+3$"],
    ["Some ½ + 3", "Some $\\frac{1}{2}+3$"],
    ["Some \\frac{1}{2} + 3", "Some 1/2 + 3"],
    ["Some 1/2 + 3", "Some ½ + 3"],
    ["Calcule √144", "Calcule $\\sqrt{144}$"],
    ["Calcule 2 · 3", "Calcule $2 \\cdot 3$"],
  ])("%s  =  %s", (input, output) => same(input, output));

  it("nunca existe item NaN", () => {
    for (const [i, o] of [["1.200,50", "1.2.3,5"], ["1.200,50", "0,50,3"]]) {
      const issues = checkExtraction(`1) ${i}`, [{ text: o }]);
      expect(JSON.stringify(issues)).not.toContain("NaN");
    }
  });

  it("e a invenção de verdade continua sendo apontada", () => {
    for (const [input, output] of [
      ["x+y=10", "x+y=5"],
      ["10^3", "10^4"],
      ["10³", "10⁴"],
      ["2^10", "2^11"],
      ["R$ 1.200,50", "R$ 1.300,50"],
      ["3 x 4", "3 × 5"],
      ["x >= 3", "x ≥ 4"],
      ["1/2", "$\\frac{1}{3}$"],
    ]) {
      expect(checkExtraction(`1) Calcule ${input}`, [{ text: `Calcule ${output}` }]).length, `${input} -> ${output}`).toBe(1);
    }
  });
});

describe("checkExtraction: onde está a questão (F5, lote 5b)", () => {
  it("cada apontamento leva quantas questões a extração tinha e o começo do texto", () => {
    const long = `Calcule ${UNREAD_FORMULA} ${"palavra ".repeat(20)}`;
    const issues = checkExtraction(`1) ${long}`, [{ text: long }, { text: "ok" }]);
    expect(issues[0].of).toBe(2);
    expect(issues[0].excerpt).toHaveLength(51);
    expect(issues[0].excerpt?.endsWith("…")).toBe(true);
  });
});

describe("números que não são decimal nem milhar (nunca NaN)", () => {
  it("mantém o token como escrito quando não dá para ler o valor", () => {
    expect(checkExtraction("Veja o código 1.2.3,5 na tabela do exercício", [{ text: "Veja o código 1.2.3,5 na tabela" }])).toEqual([]);
    const issues = checkExtraction("Veja o código 1.2.3,5 na tabela do exercício", [{ text: "Veja o código 9.8.7,5 na tabela" }]);
    expect(issues[0].items).toEqual(["9.8.7,5"]);
    expect(JSON.stringify(issues)).not.toContain("NaN");
  });
});

// N-I-001: the PDF reading writes a stacked fraction as (numerator)/denominator; the
// extraction in the real run wrote it back as `2 x + 1 / 3`, a different function.
describe("checkExtraction: fração empilhada que perdeu o agrupamento (N-I-001)", () => {
  const INPUT = "1) Dada f ( x )= (2 x + 1)/3 , calcule f(4).\n2) Pela fórmula, x = (− b ± √ Δ)/(2 a) , determine as raízes.";

  it("aponta a questão cuja fração virou 2x + 1/3", () => {
    const issues = checkExtraction(INPUT, [
      { text: "Dada f ( x )= 2 x + 1 / 3 , calcule f(4)." },
      { text: "Pela fórmula, x = (− b ± √ Δ)/(2 a) , determine as raízes." },
    ]);
    expect(issues.filter((i) => i.kind === "fraction")).toEqual([
      { question: 1, kind: "fraction", items: ["(2 x + 1)/3"], of: 2, excerpt: "Dada f ( x )= 2 x + 1 / 3 , calcule f(4)." },
    ]);
  });

  it("não aponta quando o agrupamento foi mantido, em texto ou em LaTeX", () => {
    const issues = checkExtraction(INPUT, [
      { text: "Dada f(x) = (2x + 1)/3, calcule f(4)." },
      { text: String.raw`Pela fórmula, $x = \frac{-b \pm \sqrt{\Delta}}{2a}$, determine as raízes.` },
    ]);
    expect(issues.filter((i) => i.kind === "fraction")).toEqual([]);
  });

  it("sem questão que traga o numerador, o aviso vale para o arquivo", () => {
    const issues = checkExtraction(INPUT, [{ text: "Dada outra coisa." }]);
    expect(issues.find((i) => i.kind === "fraction" && i.items[0] === "(2 x + 1)/3")).toEqual({
      question: null,
      kind: "fraction",
      items: ["(2 x + 1)/3"],
    });
  });
});
