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
  getRelevantProfiles,
  buildSystemPrompt,
  buildUserPrompt,
  SCAFFOLDING_EXAMPLE_QUESTION,
} from "./adaptationPrompt";
import { AiBlockSchema } from "../../../src/lib/adaptation/canonical/ai";

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
