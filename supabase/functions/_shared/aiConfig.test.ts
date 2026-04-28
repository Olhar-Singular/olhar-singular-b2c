import { describe, it, expect } from "vitest";
import { getAiConfig, resolveImagePayloadFields } from "./aiConfig";

function envMap(map: Record<string, string | undefined>) {
  return (key: string) => map[key];
}

describe("getAiConfig", () => {
  it("returns Lovable config when LOVABLE_API_KEY is set", () => {
    const cfg = getAiConfig(envMap({ LOVABLE_API_KEY: "lov-key" }));
    expect(cfg.apiKey).toBe("lov-key");
    expect(cfg.baseUrl).toBe("https://ai.gateway.lovable.dev/v1");
    expect(cfg.isLovable).toBe(true);
    expect(cfg.resolveModel("any-model")).toBe("any-model");
  });

  it("returns Google config when only AI_API_KEY is set", () => {
    const cfg = getAiConfig(envMap({ AI_API_KEY: "g-key" }));
    expect(cfg.apiKey).toBe("g-key");
    expect(cfg.baseUrl).toBe("https://generativelanguage.googleapis.com/v1beta/openai");
    expect(cfg.isLovable).toBe(false);
  });

  it("Google config maps known model identifiers via the MODEL_MAP", () => {
    const cfg = getAiConfig(envMap({ AI_API_KEY: "g-key" }));
    expect(cfg.resolveModel("google/gemini-2.5-pro")).toBe("gemini-2.5-pro");
    expect(cfg.resolveModel("google/gemini-2.5-flash")).toBe("gemini-2.5-flash");
    expect(cfg.resolveModel("google/gemini-3-flash-preview")).toBe("gemini-2.0-flash");
    expect(cfg.resolveModel("google/gemini-3.1-flash-image-preview")).toBe(
      "gemini-2.0-flash-preview-image-generation",
    );
  });

  it("Google config returns the model unchanged when not in MODEL_MAP", () => {
    const cfg = getAiConfig(envMap({ AI_API_KEY: "g-key" }));
    expect(cfg.resolveModel("openai/gpt-4")).toBe("openai/gpt-4");
  });

  it("Lovable takes precedence over Google when both are set", () => {
    const cfg = getAiConfig(envMap({ LOVABLE_API_KEY: "lov", AI_API_KEY: "g" }));
    expect(cfg.isLovable).toBe(true);
  });

  it("throws when no provider key is configured", () => {
    expect(() => getAiConfig(envMap({}))).toThrow(/No AI provider configured/);
  });
});

describe("resolveImagePayloadFields", () => {
  it("returns Lovable modalities for isLovable=true", () => {
    expect(resolveImagePayloadFields(true)).toEqual({ modalities: ["image", "text"] });
  });

  it("returns Google response_modalities for isLovable=false", () => {
    expect(resolveImagePayloadFields(false)).toEqual({ response_modalities: ["IMAGE", "TEXT"] });
  });
});
