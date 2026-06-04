import { describe, it, expect } from "vitest";
import {
  NEURODIVERGENCE_STRATEGIES,
  DEFAULT_PROFILES,
  MAX_ACTIVITY_CHARS,
  MAX_ACTIVITY_TYPE_CHARS,
  MAX_OBSERVATION_CHARS,
  AI_REQUEST_TIMEOUT_MS,
  getRelevantProfiles,
  buildSystemPrompt,
} from "./adaptationPrompt";

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
});

describe("named constants", () => {
  it("exposes sanitisation caps and timeout", () => {
    expect(MAX_ACTIVITY_CHARS).toBe(15000);
    expect(MAX_ACTIVITY_TYPE_CHARS).toBe(100);
    expect(MAX_OBSERVATION_CHARS).toBe(2000);
    expect(AI_REQUEST_TIMEOUT_MS).toBe(90_000);
  });
});
