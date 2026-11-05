import { describe, it, expect } from "vitest";
import * as frontendLimits from "../../../src/lib/domain/activityLimits";
import { sanitize } from "./sanitize";
import {
  NEURODIVERGENCE_STRATEGIES,
  DEFAULT_PROFILES,
  MAX_ACTIVITY_CHARS,
  MAX_ACTIVITY_TYPE_CHARS,
  MAX_OBSERVATION_CHARS,
  AI_REQUEST_TIMEOUT_MS,
  AI_REASK_TIMEOUT_MS,
  AI_TOTAL_BUDGET_MS,
  attemptTimeoutMs,
  attemptTimeoutWithinDeadlineMs,
  latexReaskFits,
  LATEX_DELIVERY_DEADLINE_MS,
  getRelevantProfiles,
  buildSystemPrompt,
  buildUserPrompt,
  SCAFFOLDING_EXAMPLE_QUESTION,
  TRUE_FALSE_EXAMPLE_QUESTION,
  LATEX_ARRAY_EXAMPLE,
  LATEX_PERCENT_EXAMPLE,
} from "./adaptationPrompt";
import { AiBlockSchema } from "../../../src/lib/adaptation/canonical/ai";
import { UNREAD_FORMULA, UNREAD_IMAGE, UNREAD_OBJECT } from "../../../src/lib/domain/unreadMarker";
import { stripScaffoldingLabel } from "./scaffoldingLabelGuard";
import { latexProblem } from "../../../src/lib/domain/latexValidation";

describe("scaffolding mandate", () => {
  const prompt = () => buildSystemPrompt([{ dimension: "tea" }]);

  it("demands support blocks instead of merely allowing them", () => {
    expect(prompt()).toContain("TEXTOS DE APOIO (SCAFFOLDING) — OBRIGATÓRIO");
  });

  it("says support belongs in a PROVA too", () => {
    // The direct-upload flow is almost always activityType "prova". While the
    // PROVA line was the only per-type line that never mentioned support — and
    // EXERCÍCIO explicitly allowed it — the model correctly inferred that
    // scaffolding was an exercise-only device and left it out of every exam.
    const provaLine = prompt().split("\n").find((l) => l.startsWith("PROVA:"));
    expect(provaLine).toBeDefined();
    expect(provaLine).toMatch(/apoio/i);
  });

  it("forbids putting the answer in the support steps", () => {
    expect(prompt()).toMatch(/nunca a resposta/i);
  });

  it("embeds the worked example so the rule has a shape to copy", () => {
    expect(prompt()).toContain(JSON.stringify(SCAFFOLDING_EXAMPLE_QUESTION));
  });

  it("keeps the worked example valid against the real AI schema", () => {
    // The example is a promise to the model about what valid output looks
    // like. If the canonical schema moves and this drifts, we would be
    // teaching the model to emit exactly what the validator then rejects.
    expect(() => AiBlockSchema.parse(SCAFFOLDING_EXAMPLE_QUESTION)).not.toThrow();
  });

  it("shows 2-4 support steps in the example", () => {
    const scaffold = SCAFFOLDING_EXAMPLE_QUESTION.stem.find((b) => b.type === "scaffolding") as
      | { items: string[] }
      | undefined;
    expect(scaffold).toBeDefined();
    expect(scaffold!.items.length).toBeGreaterThanOrEqual(2);
    expect(scaffold!.items.length).toBeLessThanOrEqual(4);
  });
});

describe("buildUserPrompt", () => {
  const base = { activityType: "prova", observations: "", activity: "1) Quanto é 2+2?" };

  it("names each barrier by its human label, not the technical key", () => {
    const out = buildUserPrompt({
      ...base,
      barriers: [
        { dimension: "dislexia", barrier_key: "dislexia_leitura", label: "Dificuldade na leitura e interpretação de enunciados" },
      ],
    });
    expect(out).toContain("Dificuldade na leitura e interpretação de enunciados");
    expect(out).toContain("(dimensão: dislexia)");
  });

  it("falls back to the key, then the dimension, then a generic word", () => {
    const out = buildUserPrompt({
      ...base,
      barriers: [
        { dimension: "tea", barrier_key: "tea_abstracao" },
        { dimension: "tdah" },
        {},
      ],
    });
    expect(out).toContain("tea_abstracao");
    expect(out).toContain("tdah (dimensão: tdah)");
    expect(out).toContain("barreira");
  });

  it("appends the per-barrier note when present", () => {
    const out = buildUserPrompt({
      ...base,
      barriers: [{ dimension: "tea", label: "Sobrecarga sensorial", notes: "piora no fim da aula" }],
    });
    expect(out).toContain("— nota: piora no fim da aula");
  });

  it("lists several barriers one per line", () => {
    const out = buildUserPrompt({
      ...base,
      barriers: [{ label: "Primeira" }, { label: "Segunda" }],
    });
    expect(out).toContain("- Primeira\n- Segunda");
  });

  it("includes the teacher's observations block when there are notes", () => {
    const out = buildUserPrompt({
      ...base,
      observations: "Lê devagar e trava com layout carregado.",
      barriers: [{ label: "X" }],
    });
    expect(out).toContain("OBSERVAÇÕES DO PROFESSOR:\nLê devagar e trava com layout carregado.");
  });

  it("omits the observations block entirely when there are none", () => {
    const out = buildUserPrompt({ ...base, barriers: [{ label: "X" }] });
    expect(out).not.toContain("OBSERVAÇÕES DO PROFESSOR");
  });

  it("carries the activity type and the original activity", () => {
    const out = buildUserPrompt({ ...base, barriers: [{ label: "X" }] });
    expect(out).toContain("TIPO DE ATIVIDADE: prova");
    expect(out).toContain("ATIVIDADE ORIGINAL:\n1) Quanto é 2+2?");
  });
});

describe("getRelevantProfiles", () => {
  it("returns the dimensions that map to a known strategy", () => {
    const out = getRelevantProfiles([{ dimension: "tea" }, { dimension: "tdah" }]);
    expect(out).toEqual(["tea", "tdah"]);
  });

  it("deduplicates repeated dimensions", () => {
    expect(getRelevantProfiles([{ dimension: "dislexia" }, { dimension: "dislexia" }])).toEqual([
      "dislexia",
    ]);
  });

  it("ignores unknown dimensions and missing dimensions", () => {
    const out = getRelevantProfiles([
      { dimension: "tea" },
      { dimension: "not_a_real_profile" },
      {},
    ]);
    expect(out).toEqual(["tea"]);
  });

  it("falls back to the default trio when nothing maps (fallback branch)", () => {
    expect(getRelevantProfiles([{ dimension: "unknown" }, {}])).toEqual([...DEFAULT_PROFILES]);
    expect(getRelevantProfiles([])).toEqual([...DEFAULT_PROFILES]);
  });
});

describe("buildSystemPrompt", () => {
  it("embeds the strategies for the relevant profiles", () => {
    const prompt = buildSystemPrompt([{ dimension: "dislexia" }]);
    expect(prompt).toContain(NEURODIVERGENCE_STRATEGIES.dislexia);
    expect(prompt).toContain("ESTRATÉGIAS PARA O PERFIL IDENTIFICADO");
  });

  it("uses the default profiles when no barrier maps", () => {
    const prompt = buildSystemPrompt([]);
    for (const p of DEFAULT_PROFILES) {
      expect(prompt).toContain(NEURODIVERGENCE_STRATEGIES[p]);
    }
  });

  it("instructs a single structured JSON output (no markdown/sections)", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).toContain("FORMATO DE SAÍDA (OBRIGATÓRIO — JSON ESTRUTURADO)");
    expect(prompt).toContain("UMA ÚNICA versão adaptada");
  });

  it("tells the model the ordering array is the printed order and must not be the answer key", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).toContain('Em "ordering", a ordem do array "items" é a ordem IMPRESSA');
    expect(prompt).toContain("NUNCA liste os itens já na ordem correta");
  });

  it("instructs turning an [IMAGEM: <url>] marker into an image block (exact src, alt, no literal marker)", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    // Mentions the marker syntax and the image-block contract.
    expect(prompt).toContain("[IMAGEM:");
    expect(prompt).toContain('bloco de imagem (type "image")');
    expect(prompt).toContain('"src" EXATAMENTE igual');
    expect(prompt).toContain('"alt"');
    // And tells the model not to leak the literal marker.
    expect(prompt).toContain("NÃO deixe o marcador literal");
  });

  it("grounds the image alt on the extraction description and forbids inventing or revealing the answer (0279)", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).toContain("[DESCRIÇÃO DA IMAGEM:");
    expect(prompt).toContain("Você NÃO vê a imagem");
    expect(prompt).toContain("NUNCA revele a resposta");
    expect(prompt).toContain("Figura da questão N");
    expect(prompt).not.toContain("um \"alt\" curto e descritivo");
  });

  it("forbids inventing images and tells the model to describe in text instead", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).toContain("NUNCA invente");
    expect(prompt).toContain("URL inventada");
  });

  // gemini-2.5-pro was observed mixing the two enums in production: emitting
  // `answer.kind: "scaffolding"` (a BLOCK type) and a `table` BLOCK inside a
  // stem (`table` is an answer kind). Each mistake costs a ~50s reask.
  it("keeps the block-type and answer-kind vocabularies apart", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    // The closed list of block types, and that nothing else is a block.
    expect(prompt).toContain("NÃO existem outros tipos de bloco");
    expect(prompt).toContain('"table" NÃO é um tipo de bloco');
    // And that block names are never valid answer kinds.
    expect(prompt).toContain('NUNCA use um nome de bloco como "answer.kind"');
    expect(prompt).toContain('"scaffolding"');
  });

  // 0474: an informative table in the stem came out as ONE paragraph with "•"
  // and "|" glued by "\n", and the support told the student to read the
  // "coluna 'Preço (R$)'" that the printed sheet does not have.
  it("describes an informative table one paragraph per row, with no fake list marks (0474)", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).toContain('cada linha da tabela vira um "paragraph" próprio');
    expect(prompt).toContain('NUNCA junte linhas com "\\n", "•" ou "|"');
  });

  it("forbids support/tips from pointing at columns or rows the sheet does not show (0474)", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).toContain('o apoio NÃO pode mandar o aluno olhar "coluna" ou "linha" da tabela');
  });
});

/**
 * The wizard has to warn BEFORE charging a credit for an activity the server
 * would truncate, so it carries its own copy of the cap (it cannot import from
 * `supabase/functions/`). Same duplication + sync-test pattern as the credit
 * tables in adaptationCost.ts: drift here means the UI green-lights a paste the
 * server silently cuts in half.
 */
describe("activity cap stays in sync with the frontend", () => {
  it("MAX_ACTIVITY_CHARS matches src/lib/domain/activityLimits", () => {
    expect(MAX_ACTIVITY_CHARS).toBe(frontendLimits.MAX_ACTIVITY_CHARS);
  });

  it("the frontend counts exactly what sanitize() will truncate", () => {
    const samples = ["abc", "<script>", "a & b", 'x "y" z', "it's", "  trim  "];
    for (const sample of samples) {
      expect(frontendLimits.escapedLength(sample)).toBe(sanitize(sample, MAX_ACTIVITY_CHARS).length);
    }
  });
});

describe("buildSystemPrompt — fidelityMode", () => {
  it("omits the MODO FIEL block by default (bank/paste flow unchanged)", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }]);
    expect(prompt).not.toContain("MODO FIEL");
  });

  it("omits the MODO FIEL block when fidelityMode is explicitly false", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }], { fidelityMode: false });
    expect(prompt).not.toContain("MODO FIEL");
  });

  it("adds the MODO FIEL block when fidelityMode is true", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }], { fidelityMode: true });
    expect(prompt).toContain("MODO FIEL");
  });

  it("instructs preserving the original order of questions and images exactly", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }], { fidelityMode: true });
    expect(prompt).toContain("ORDEM ORIGINAL");
    expect(prompt).toContain("não reordene");
  });

  it("instructs changing text only when the barrier requires it, preserving wording otherwise", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }], { fidelityMode: true });
    expect(prompt).toContain("Só modifique o TEXTO");
    expect(prompt).toContain("EXIGIR");
    expect(prompt).toContain("preserve a redação original");
  });

  it("requires support text rather than merely permitting it", () => {
    // The other two MODO FIEL rules are "inegociáveis" and both pull towards
    // leaving the exam alone. A permissive third rule ("você pode adicionar")
    // loses that tug-of-war, so turning fidelity on would make adaptations
    // MORE like the original — the opposite of what was asked for.
    const prompt = buildSystemPrompt([{ dimension: "tea" }], { fidelityMode: true });
    expect(prompt).toContain("ADICIONE textos de apoio");
    expect(prompt).not.toContain("pode ADICIONAR textos de apoio");
  });

  it("does not let fidelity be read as a licence to skip support", () => {
    const prompt = buildSystemPrompt([{ dimension: "tea" }], { fidelityMode: true });
    expect(prompt).toMatch(/NÃO dispensa o apoio/i);
  });
});

describe("named constants", () => {
  it("exposes sanitisation caps and timeout", () => {
    expect(MAX_ACTIVITY_CHARS).toBe(15000);
    expect(MAX_ACTIVITY_TYPE_CHARS).toBe(100);
    expect(MAX_OBSERVATION_CHARS).toBe(2000);
    expect(AI_REQUEST_TIMEOUT_MS).toBe(90_000);
  });
});

// A reask replays the whole previous document plus the error list, so it runs
// materially slower than the first call — measured at 28s → 64s on the same
// activity. Holding it to the first call's budget is what turned recoverable
// validation failures into "A IA demorou demais" 502s.
describe("attemptTimeoutMs", () => {
  it("gives the first attempt the base timeout", () => {
    expect(attemptTimeoutMs(1, 0)).toBe(AI_REQUEST_TIMEOUT_MS);
  });

  it("gives a reask the larger reask timeout", () => {
    expect(attemptTimeoutMs(2, 0)).toBe(AI_REASK_TIMEOUT_MS);
    expect(AI_REASK_TIMEOUT_MS).toBeGreaterThan(AI_REQUEST_TIMEOUT_MS);
  });

  it("never lets the attempts exceed the total budget", () => {
    // 200s already spent, so only 40s of the 240s budget remain.
    expect(attemptTimeoutMs(2, 200_000)).toBe(AI_TOTAL_BUDGET_MS - 200_000);
  });

  it("returns 0 when too little budget remains to be worth an attempt", () => {
    expect(attemptTimeoutMs(2, AI_TOTAL_BUDGET_MS - 1_000)).toBe(0);
    expect(attemptTimeoutMs(2, AI_TOTAL_BUDGET_MS + 50_000)).toBe(0);
  });

  it("keeps the worst case inside the Supabase wall-clock limit", () => {
    expect(AI_TOTAL_BUDGET_MS).toBeLessThan(400_000);
  });
});

describe("trueFalse contract (0388)", () => {
  const prompt = () => buildSystemPrompt([{ dimension: "tea" }]);

  it("says each item is a statement and the V/F marker is printed automatically", () => {
    expect(prompt()).toMatch(/cada item é uma AFIRMAÇÃO/);
    expect(prompt()).toMatch(/\( \) V \( \) F/);
    expect(prompt()).toMatch(/NUNCA[^.]*"Verdadeiro"[^.]*"Falso"/);
  });
});

// 0393: on the paste path (no fidelityMode) the "nothing is removed" rule did
// not exist, so the AI silently dropped the teacher's evaluation criteria,
// deadline and glossary. The rule must hold on every path, and any removal has
// to be named in the justification the teacher reads.
describe("content preservation on every path (0393)", () => {
  const prompt = () => buildSystemPrompt([{ dimension: "tdah" }]);

  it("forbids dropping the teacher's informative blocks even without fidelityMode", () => {
    expect(prompt()).toContain("PRESERVAÇÃO DO CONTEÚDO DO PROFESSOR");
    expect(prompt()).toMatch(/critérios de avaliação[^.]*prazos[^.]*glossários/i);
    expect(prompt()).toMatch(/NUNCA remova[^.]*em silêncio/);
  });

  it("requires listing every removed block, and why, in pedagogical_justification", () => {
    expect(prompt()).toMatch(/"pedagogical_justification"[^.]*o que saiu e por quê/);
  });

  it("does not read 'describe an informative table' as licence to drop its values", () => {
    expect(prompt()).toMatch(/descrevê-la em parágrafos NÃO autoriza omitir/);
  });
});

describe("conteúdo não lido (C-03)", () => {
  const rule = () =>
    buildSystemPrompt([{ dimension: "tea" }])
      .split("\n")
      .find((line) => line.includes("NÃO LIDO")) ?? "";

  it("manda manter o marcador de 'não lida' no lugar, sem inventar a conta nem resolver", () => {
    for (const marker of [UNREAD_FORMULA, UNREAD_IMAGE, UNREAD_OBJECT]) expect(rule()).toContain(marker);
    expect(rule()).toMatch(/NUNCA/);
    expect(rule()).toMatch(/gabarito/i);
  });

  it("não contradiz o schema: manda reservar a 1ª alternativa e value false, e avisar (F6-1)", () => {
    expect(rule()).not.toMatch(/Não marque gabarito/);
    expect(rule()).toMatch(/ESPAÇO RESERVADO/);
    expect(rule()).toMatch(/PRIMEIRA alternativa/);
    expect(rule()).toMatch(/"value": false/);
  });
});

// C-04: a rule that says "describe the figure in text" invited the model to invent the figure's data
// (points of a graph, sides of a rectangle) the teacher never wrote.
describe("figura sem dados (C-04)", () => {
  const rule = () =>
    buildSystemPrompt([{ dimension: "tea" }])
      .split("\n")
      .find((line) => line.includes("FIGURA, GRÁFICO OU TABELA SEM DADOS")) ?? "";

  it("proíbe inventar número, medida, ponto ou alternativa que o professor não escreveu", () => {
    expect(rule()).toMatch(/NUNCA invente[^.]*número[^.]*medida[^.]*ponto/);
    expect(rule()).toMatch(/alternativa/);
  });

  it("manda manter a referência à figura e dizer que ela é necessária, no lugar de descrevê-la", () => {
    expect(rule()).toMatch(/mantenha a referência/i);
    expect(rule()).toMatch(/figura é necessária/i);
  });

  it("aponta o marcador de imagem não lida, que já existe, em vez de um conceito novo", () => {
    expect(rule()).toContain(UNREAD_IMAGE);
  });

  it("não manda mais descrever em texto uma figura que o professor não deu", () => {
    expect(buildSystemPrompt([{ dimension: "tea" }])).not.toMatch(/descreva-a em TEXTO \(um parágrafo\)/);
  });
});

// C-20: "Passo 1:" inside an item the sheet numbers again printed "2. Passo 1: ...".
describe("apoio sem rótulo de passo (C-20)", () => {
  it("manda não escrever o rótulo, porque a folha já numera os itens", () => {
    const p = buildSystemPrompt([{ dimension: "tea" }]);
    expect(p).toMatch(/a folha já numera os itens[\s\S]{0,40}NÃO escreva "Passo 1:"/);
  });

  it("os itens do exemplo não trazem rótulo (o que o modelo copia)", () => {
    const scaffold = SCAFFOLDING_EXAMPLE_QUESTION.stem.find((b) => b.type === "scaffolding") as { items: string[] };
    for (const item of scaffold.items) expect(stripScaffoldingLabel(item)).toBe(item);
  });
});

// C-21: the teacher's structure survives outside the exam-upload mode too.
describe("estrutura do professor em todo modo (C-21)", () => {
  const prompt = () => buildSystemPrompt([{ dimension: "tea" }]);

  it("mantém a ordem e a quantidade das questões mesmo sem o modo fiel", () => {
    expect(prompt()).not.toContain("MODO FIEL");
    expect(prompt()).toMatch(/mesma ORDEM e a mesma QUANTIDADE de questões/);
    expect(prompt()).toMatch(/gabarito do professor/i);
  });

  it("uma questão V/F com várias afirmações continua uma questão", () => {
    expect(prompt()).toMatch(/UMA questão "trueFalse" com um item por afirmação/);
    expect(prompt()).toMatch(/nunca[^.]*uma questão por afirmação/i);
  });

  it("a tabela que várias questões usam é escrita uma vez, não repetida em cada questão", () => {
    expect(prompt()).toMatch(/UMA vez[^.]*antes da primeira questão[^.]*não a repita/i);
  });

  it("o exemplo de V/F é válido no schema real e está no prompt", () => {
    expect(() => AiBlockSchema.parse(TRUE_FALSE_EXAMPLE_QUESTION)).not.toThrow();
    expect(prompt()).toContain(JSON.stringify(TRUE_FALSE_EXAMPLE_QUESTION));
    const items = (TRUE_FALSE_EXAMPLE_QUESTION.answer as { items: unknown[] }).items;
    expect(items.length).toBeGreaterThanOrEqual(2);
    expect(JSON.stringify(items)).not.toMatch(/"(Verdadeiro|Falso|V|F)"/);
  });

  it("o modo fiel continua com a regra de ordem própria", () => {
    expect(buildSystemPrompt([{ dimension: "tea" }], { fidelityMode: true })).toContain("ORDEM ORIGINAL");
  });
});

// C-10 prompt side (I-004, I-005) and C-18: the three ways the model wrote LaTeX the sheet cannot show.
describe("LaTeX válido no prompt (C-10, C-18)", () => {
  const prompt = () => buildSystemPrompt([{ dimension: "tea" }]);
  const rule = () => prompt().split("\n").find((l) => l.startsWith("- MATEMÁTICA")) ?? "";

  it("manda a lacuna ficar FORA da fórmula (I-004)", () => {
    expect(rule()).toMatch(/NUNCA[^.]*lacuna[^.]*___[^.]*dentro de "latex"/);
    expect(rule()).toMatch(/texto comum/);
  });

  it("manda o array sem @{} (I-005) e dá um exemplo que o KaTeX aceita", () => {
    expect(rule()).toContain("@{}");
    expect(rule()).toMatch(/NUNCA[^.]*@\{\}/);
    expect(rule()).toContain(LATEX_ARRAY_EXAMPLE);
    expect(latexProblem(LATEX_ARRAY_EXAMPLE)).toBeNull();
  });

  it("diz o que o % exige (\\%) e o exemplo é válido", () => {
    expect(rule()).toMatch(/%[^.]*\\%/);
    expect(rule()).toContain(LATEX_PERCENT_EXAMPLE);
    expect(latexProblem(LATEX_PERCENT_EXAMPLE)).toBeNull();
  });

  it("lembra que a barra do comando é DUPLA no JSON (C-12)", () => {
    expect(rule()).toMatch(/barra[^.]*dupla|duas barras/i);
  });

  it("manda manter o numerador inteiro de (numerador)/(denominador) (N-I-001)", () => {
    expect(rule()).toContain("(2 x + 1)/3");
    expect(rule()).toContain("2x + \\frac{1}{3}");
    expect(rule()).toMatch(/numerador INTEIRO/);
  });
});


describe("prazo de entrega com fórmula inválida (L7-1)", () => {
  it("o prazo fica abaixo do corte de 150 s do gateway", () => {
    expect(LATEX_DELIVERY_DEADLINE_MS).toBeLessThan(150_000);
  });

  it("o reask só começa se terminar (60 s) antes do prazo", () => {
    expect(latexReaskFits(0)).toBe(true);
    expect(latexReaskFits(79_999)).toBe(true);
    expect(latexReaskFits(80_000)).toBe(false);
  });

  it("nenhuma tentativa passa do prazo, tenha ou não um documento em mãos (reask de schema incluído)", () => {
    expect(attemptTimeoutWithinDeadlineMs(1, 0)).toBe(90_000); // the first call keeps its own cap
    expect(attemptTimeoutWithinDeadlineMs(2, 20_000)).toBe(120_000); // the reask cap is below what is left
    expect(attemptTimeoutWithinDeadlineMs(2, 50_000)).toBe(90_000); // 140 - 50: it ends before the 150 s cut
    expect(attemptTimeoutWithinDeadlineMs(2, 100_000)).toBe(40_000);
    expect(attemptTimeoutWithinDeadlineMs(3, 115_000)).toBe(0); // 25 s left: not worth a call
    expect(attemptTimeoutWithinDeadlineMs(2, 230_000)).toBe(0);
  });

  it("um reask depois de 90 s da 1ª chamada ainda termina antes de 150 s (o caso de 210 s a 240 s)", () => {
    const afterFirstCall = 90_000;
    expect(afterFirstCall + attemptTimeoutWithinDeadlineMs(2, afterFirstCall)).toBeLessThan(150_000);
  });
});
