import { describe, it, expect } from "vitest";
import { getAiConfig } from "./aiConfig";

function envMap(map: Record<string, string | undefined>) {
  return (key: string) => map[key];
}

describe("getAiConfig", () => {
  it("returns Google config when AI_API_KEY is set", () => {
    const cfg = getAiConfig(envMap({ AI_API_KEY: "g-key" }));
    expect(cfg.apiKey).toBe("g-key");
    expect(cfg.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
  });

  it("maps known model identifiers via the MODEL_MAP", () => {
    const cfg = getAiConfig(envMap({ AI_API_KEY: "g-key" }));
    expect(cfg.resolveModel("google/gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(cfg.resolveModel("google/gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(cfg.resolveModel("google/gemini-3-flash-preview")).toBe("gemini-2.0-flash");
    expect(cfg.resolveModel("google/gemini-3.1-flash-image-preview")).toBe(
      "gemini-2.0-flash-preview-image-generation",
    );
  });

  it("returns the model unchanged when not in MODEL_MAP", () => {
    const cfg = getAiConfig(envMap({ AI_API_KEY: "g-key" }));
    expect(cfg.resolveModel("openai/gpt-4")).toBe("openai/gpt-4");
  });

  it("ignores LOVABLE_API_KEY entirely — throws when only LOVABLE_API_KEY is set", () => {
    expect(() => getAiConfig(envMap({ LOVABLE_API_KEY: "lov-key" }))).toThrow(
      /No AI provider configured/,
    );
  });

  it("no longer exposes an isLovable flag on the config", () => {
    const cfg = getAiConfig(envMap({ AI_API_KEY: "g-key" }));
    expect("isLovable" in cfg).toBe(false);
  });

  it("throws when no provider key is configured", () => {
    expect(() => getAiConfig(envMap({}))).toThrow(/No AI provider configured/);
  });

  it("uses the default EnvGetter (globalThis.Deno) when no argument is passed (line 18)", () => {
    (globalThis as { Deno?: unknown }).Deno = {
      env: { get: (k: string) => (k === "AI_API_KEY" ? "deno-g-key" : undefined) },
    };
    try {
      const cfg = getAiConfig();
      expect(cfg.apiKey).toBe("deno-g-key");
      expect(cfg.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    } finally {
      delete (globalThis as { Deno?: unknown }).Deno;
    }
  });
});
