import { describe, it, expect, vi } from "vitest";
import { reviewAdaptation, reviewAdaptationSafely } from "./adaptationReview.ts";
import { UNREAD_FORMULA } from "../../../src/lib/domain/unreadMarker.ts";

const text = (t: string) => ({ type: "text", text: t });
const para = (t: string) => ({ type: "paragraph", content: [text(t)] });
const question = (stem: unknown[], answer: unknown = { kind: "open" }, extra: Record<string, unknown> = {}) => ({
  type: "question",
  stem,
  answer,
  ...extra,
});
const doc = (...blocks: unknown[]) => ({ document: { blocks } });

// The C-04 case, as the model returned it: a figure question with a rectangle nobody gave.
const FIGURE_ACTIVITY = "1) Observe a figura e calcule a área da região sombreada.\n2) Calcule 12 + 3.";

describe("reviewAdaptation (C-04)", () => {
  it("flags a number in a question that points at a figure when the activity never gave it", () => {
    const issues = reviewAdaptation(
      FIGURE_ACTIVITY,
      doc(question([para("A figura mostra um retângulo de 10 cm por 8 cm. Calcule a área da região sombreada.")])),
    );
    expect(issues).toEqual([
      {
        question: 1,
        kind: "new_value",
        items: ["10", "8"],
        of: 1,
        excerpt: "A figura mostra um retângulo de 10 cm por 8 cm. Ca…",
      },
    ]);
  });

  it("does not flag the same question when the numbers are the teacher's", () => {
    const issues = reviewAdaptation(
      "1) A figura mostra um retângulo de 10 cm por 8 cm. Calcule a área.",
      doc(question([para("Na figura, o retângulo mede 10 cm por 8 cm. Calcule a área.")])),
    );
    expect(issues).toEqual([]);
  });

  it("checks the alternatives and the instruction too, with the number of the question on the sheet", () => {
    const issues = reviewAdaptation(
      "1) Calcule 3 + 4.\n2) Veja o gráfico. Qual o maior valor?",
      doc(
        question([para("Calcule 3 + 4.")]),
        question(
          [para("Veja o gráfico.")],
          { kind: "multipleChoice", alternatives: [{ content: [text("45")], correct: true }, { content: [text("60")], correct: false }] },
          { instruction: [text("Marque uma.")] },
        ),
      ),
    );
    expect(issues).toHaveLength(1);
    expect(issues[0]).toMatchObject({ question: 2, kind: "new_value", items: ["45", "60"], of: 2 });
  });

  it("reads every alternative shape: checkbox, true/false, ordering, matching, table cells, math and enunciado", () => {
    const fig = [para("Veja a figura.")];
    const items = (...ts: string[]) => ts.map((t) => ({ content: [text(t)] }));
    const doc2 = doc(
      question(fig, { kind: "checkbox", items: items("77") }),
      question(fig, { kind: "trueFalse", items: items("88") }),
      question(fig, { kind: "ordering", items: items("99x") }),
      question(fig, { kind: "matching", pairs: [{ left: [text("1234")], right: [{ type: "inlineMath", latex: "5678" }] }] }),
      question(fig, { kind: "table", rows: [[[text("4321")]]] }),
      question([...fig, { type: "blockMath", latex: "8765" }, { type: "heading", content: [text("2468")] }]),
      question(fig, { kind: "open" }, { enunciado: [text("1357")] }),
    );
    const flagged = reviewAdaptation("Veja a figura.", doc2).map((i) => [i.question, i.items.join(",")]);
    expect(flagged).toEqual([
      [1, "77"],
      [2, "88"],
      [3, "99"],
      [4, "1234,5678"],
      [5, "4321"],
      [6, "8765,2468"],
      [7, "1357"],
    ]);
  });

  it("does not look at the support text: its worked examples are meant to be new", () => {
    const issues = reviewAdaptation(
      "1) Observe a figura e calcule a área.",
      doc(question([para("Observe a figura e calcule a área."), { type: "scaffolding", items: ["Exemplo: um quadrado de lado 4 tem área 16."] }])),
    );
    expect(issues).toEqual([]);
  });

  it("ignores questions that do not point at a figure, graph or table (the model rewrites those freely)", () => {
    const issues = reviewAdaptation(
      "1) Calcule 2^5.",
      doc(question([para("Calcule 2^5. Lembre-se: 2^5 = 2 x 2 x 2 x 2 x 2 = 32, ou seja, 32 unidades.")])),
    );
    expect(issues).toEqual([]);
  });

  it("does not treat the values the language implies as invented (ângulo reto, por cento)", () => {
    const issues = reviewAdaptation(
      "1) Na figura, o ângulo B é reto. Calcule AC.",
      doc(question([para("Na figura, o ângulo B mede 90 graus (ângulo reto). Calcule AC.")])),
    );
    expect(issues).toEqual([]);
  });

  it("has nothing to compare with when the activity has no real text (a scan or a photo)", () => {
    expect(reviewAdaptation("--- Página 1 ---", doc(question([para("A figura mostra 10 cm por 8 cm.")])))).toEqual([]);
  });

  it("flags a not-read marker the AI removed", () => {
    const issues = reviewAdaptation(
      `1) Resolva ${UNREAD_FORMULA}.\n2) Resolva ${UNREAD_FORMULA}.`,
      doc(question([para(`Resolva ${UNREAD_FORMULA}.`)]), question([para("Resolva 5 + 5.")])),
    );
    expect(issues).toEqual([{ question: null, kind: "marker_dropped", items: [] }]);
  });

  it("keeps the marker in the support text counted as present (it is on the sheet)", () => {
    const issues = reviewAdaptation(
      `1) Resolva ${UNREAD_FORMULA}.`,
      doc(question([para("Resolva."), { type: "scaffolding", items: [`Releia ${UNREAD_FORMULA}`] }])),
    );
    expect(issues).toEqual([]);
  });

  it("counts a marker found in headings, math, alternatives and pairs as still there", () => {
    const m = UNREAD_FORMULA;
    const issues = reviewAdaptation(
      `${m} ${m} ${m} ${m} ${m} ${m} ${m} ${m}`,
      doc(
        { type: "heading", content: [text(m)] },
        { type: "blockMath", latex: m },
        question([para(m)], { kind: "multipleChoice", alternatives: [{ content: [text(m)], correct: true }] }, { instruction: [text(m)], enunciado: [text(m)] }),
        question([para("x")], { kind: "trueFalse", items: [{ content: [text(m)] }] }),
        question([para("y")], { kind: "matching", pairs: [{ left: [text(m)], right: [text("z")] }] }),
      ),
    );
    // The marker is still there (nothing "dropped"); the two keyed questions only carry the reserved-key notice.
    expect(issues.map((x) => x.kind)).toEqual(["answer_key", "answer_key"]);
  });

  it("survives any shape the model may send, as text", () => {
    const weird = { document: { blocks: [null, { type: "question" }, { type: "question", stem: "x", answer: { alternatives: "x", items: 3, pairs: null, rows: [null, [null]] } }, { type: "scaffolding", items: [7, null] }] } };
    expect(reviewAdaptation("Veja a figura 1234", weird as never)).toEqual([]);
    expect(reviewAdaptation(undefined as never, null)).toEqual([]);
    expect(reviewAdaptation("x", { document: { blocks: "no" } })).toEqual([]);
    expect(reviewAdaptation("x", {})).toEqual([]);
  });
});

describe("reviewAdaptationSafely", () => {
  it("returns the same issues", () => {
    expect(reviewAdaptationSafely(FIGURE_ACTIVITY, doc(question([para("Na figura, 77 cm.")])))).toHaveLength(1);
  });

  it("never throws: a failure costs the notice, not the adaptation", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    const hostile = { get document(): never { throw new Error("boom"); } };
    expect(reviewAdaptationSafely("x", hostile)).toEqual([]);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});

describe("reviewAdaptation: fração que perdeu o agrupamento (N-I-001)", () => {
  const ACTIVITY = "1) Dada f ( x )= (2 x + 1)/3 , calcule f(4).";

  it("aponta f(x) = 2x + \\frac{1}{3}, o caso real: f(4) deixa de ser 3", () => {
    const issues = reviewAdaptation(
      ACTIVITY,
      doc(question([{ type: "paragraph", content: [text("Dada "), { type: "inlineMath", latex: String.raw`f(x) = 2x + \frac{1}{3}` }, text(", calcule f(4).")] }])),
    );
    expect(issues).toEqual([
      { question: 1, kind: "fraction", items: ["(2 x + 1)/3"], of: 1, excerpt: "Dada f(x) = 2x + \\frac{1}{3}, calcule f(4)." },
    ]);
  });

  it("não aponta quando a fração saiu como \\frac{2x + 1}{3}", () => {
    const issues = reviewAdaptation(
      ACTIVITY,
      doc(question([{ type: "paragraph", content: [{ type: "inlineMath", latex: String.raw`f(x) = \frac{2x + 1}{3}` }] }])),
    );
    expect(issues).toEqual([]);
  });

  it("sem questão com o numerador, o aviso é do arquivo; sem fração no arquivo, nada", () => {
    expect(reviewAdaptation(ACTIVITY, doc(question([para("Outra coisa.")])))).toEqual([
      { question: null, kind: "fraction", items: ["(2 x + 1)/3"] },
    ]);
    expect(reviewAdaptation("1) Calcule 2 + 3.", doc(question([para("Calcule 2 + 3.")])))).toEqual([]);
  });
});

// F6-1: the prompt used to forbid any key on a question with an unread part; the schema demands one.
describe("questão com parte não lida e gabarito reservado (F6-1)", () => {
  const unreadJson = (kind: "multipleChoice" | "trueFalse") => ({
    blocks: [
      {
        type: "question",
        stem: [{ type: "paragraph", content: [{ type: "text", text: `Calcule ${UNREAD_FORMULA} e marque.` }] }],
        answer:
          kind === "multipleChoice"
            ? {
                kind,
                alternatives: [
                  { content: [{ type: "text", text: "2" }], correct: true },
                  { content: [{ type: "text", text: "4" }], correct: false },
                ],
              }
            : { kind, items: [{ content: [{ type: "text", text: "afirmação" }], value: false }] },
      },
    ],
    strategies_applied: ["s"],
    pedagogical_justification: "j",
    implementation_tips: ["t"],
  });

  it.each(["multipleChoice", "trueFalse"] as const)(
    "o gabarito que o prompt manda reservar (%s) passa pelo schema real e vira aviso",
    async (kind) => {
      const { interpretAiResponse } = await import("./adaptActivityCore.ts");
      const interpreted = interpretAiResponse(JSON.stringify(unreadJson(kind)));
      expect(interpreted.ok).toBe(true);
      if (!interpreted.ok) return;
      const issues = reviewAdaptation(`1) Calcule ${UNREAD_FORMULA} e marque.`, interpreted.result);
      expect(issues).toEqual([
        expect.objectContaining({ question: 1, kind: "answer_key", items: [], of: 1 }),
      ]);
    },
  );

  it("questão aberta com marcador, ou de múltipla escolha sem marcador, não leva esse aviso", () => {
    const open = reviewAdaptation(`1) Calcule ${UNREAD_FORMULA}`, doc(question([para(`Calcule ${UNREAD_FORMULA}`)])));
    expect(open.map((i) => i.kind)).not.toContain("answer_key");
    const clean = reviewAdaptation(
      "1) Quanto é 2 + 2?",
      doc(question([para("Quanto é 2 + 2?")], { kind: "multipleChoice", alternatives: [{ content: [text("4")], correct: true }] })),
    );
    expect(clean).toEqual([]);
  });
});

// F6-3: instruction numbers and number words are not invented data.
describe("reviewAdaptation: menos falso positivo (F6-3)", () => {
  const FIG = "1) Observe o gráfico e responda.";
  const flagged = (activity: string, stem: string) =>
    reviewAdaptation(activity, doc(question([para(stem)]))).filter((i) => i.kind === "new_value");

  it.each([
    "Observe o gráfico. Marque apenas 1 alternativa.",
    "Observe o gráfico e responda em 3 linhas.",
    "Observe o gráfico. Use 2 casas decimais.",
    "Passo 1: observe o gráfico.",
    "Questão 2: observe o gráfico.",
    "Observe o gráfico para a turma do 7º ano.",
    "Observe o gráfico: escolha 2 opções.",
  ])("não acusa o número de instrução em %j", (stem) => {
    expect(flagged(FIG, stem)).toEqual([]);
  });

  // L9A-5: "7 casas" is data when nothing in the sentence is giving an instruction.
  it("acusa o número novo mesmo ao lado de uma palavra que também aparece em instruções (Lote 6, caso F)", () => {
    const activity = "1) Observe a figura e some 6 + 3.";
    expect(flagged(activity, "Ana tem 6 balas e ganha 3. Observe a figura: são 7 casas. Quantas balas?").map((i) => i.items)).toEqual([["7"]]);
    expect(flagged(activity, "Observe a figura: a rua tem 7 linhas de casas. Quantas balas?").map((i) => i.items)).toEqual([["7"]]);
    expect(flagged(activity, "Observe a figura: há 7 itens na mesa.").map((i) => i.items)).toEqual([["7"]]);
    expect(flagged(activity, "Observe a figura: são 7 respostas na lista.").map((i) => i.items)).toEqual([["7"]]);
  });

  it("a instrução de uma frase não esconde o número de dado de outra", () => {
    expect(flagged("1) Observe a figura.", "Marque 1 alternativa. A figura tem 7 itens.").map((i) => i.items)).toEqual([["7"]]);
  });

  it.each([
    "Observe o gráfico. Responda com 5 linhas.",
    "Observe o gráfico. Escreva em até 3 linhas.",
    "Observe o gráfico. Resposta em no máximo 4 linhas.",
    "Observe o gráfico e escolha somente 1 alternativa.",
    "Observe o gráfico. Selecione 2 respostas.",
    "Observe a tabela. Cite pelo menos 3 palavras.",
    "Observe a tabela. Use 2 casas decimais no resultado.",
    "Observe a figura. Descreva o que você vê em 3 linhas.",
    "Observe a figura. Redija 2 frases sobre ela.",
  ])("continua sem acusar a instrução em %j", (stem) => {
    expect(flagged(FIG, stem)).toEqual([]);
  });

  // L10 N1 to N4: each part of the instruction rule is held by its own case.
  it("cada parte da regra de instrução tem o seu caso (L10 N1 a N4)", () => {
    // N1: "escreva" is a verb of its own, no limit word needed
    expect(flagged(FIG, "Observe o gráfico. Escreva 5 linhas.")).toEqual([]);
    // N2: "até" is a limit of its own, no verb needed
    expect(flagged(FIG, "Observe o gráfico, resposta de até 3 linhas.")).toEqual([]);
    // N3: the verb of another sentence gives no instruction to this number
    expect(flagged("1) Observe a figura.", "Marque a resposta. A figura tem 7 itens.").map((i) => i.items)).toEqual([["7"]]);
    // N4: nor does a verb far back in the same sentence (more than 60 characters before the number)
    const far = "Observe a figura. Escreva um relato sobre a figura mostrada aqui na lista bem longa que a turma viu e anotou hoje: há 7 itens.";
    expect(far.indexOf("7") - far.indexOf("Escreva")).toBeGreaterThan(70);
    expect(flagged("1) Observe a figura.", far).map((i) => i.items)).toEqual([["7"]]);
  });

  it("não acusa o número que a atividade escreveu por extenso (dez -> 10, primeiro -> 1º, duas -> 2)", () => {
    expect(flagged("1) Observe o gráfico: dez alunos votaram, no primeiro dia, em duas opções.", "Observe o gráfico: 10 alunos votaram, no 1º dia, em 2 opções.")).toEqual([]);
  });

  it("continua acusando um número de dado que a atividade nunca deu", () => {
    expect(flagged(FIG, "Observe o gráfico: 15 alunos votaram. Marque 1 alternativa.").map((i) => i.items)).toEqual([["15"]]);
  });

  it("um/uma/segundo na atividade não escondem o número 1 ou 2 inventado", () => {
    expect(flagged("1) Observe o gráfico de uma função, um segundo depois.", "Observe o gráfico: 1 | 7.").map((i) => i.items)).toEqual([["1", "7"]]);
  });

  it("(L1) só olha questão que cita figura, gráfico ou tabela: sem a palavra, número novo passa", () => {
    expect(flagged("1) Calcule a soma.", "Calcule a soma de 17 e 25.")).toEqual([]);
    expect(flagged("1) Observe o gráfico.", "Observe o gráfico de 17 barras.").length).toBe(1);
  });
});
