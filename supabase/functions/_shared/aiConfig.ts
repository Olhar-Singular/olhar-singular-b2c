export interface AiConfig {
  apiKey: string;
  baseUrl: string;
  resolveModel: (model: string) => string;
}

const MODEL_MAP: Record<string, string> = {
  "google/gemini-2.5-pro": "gemini-2.5-pro",
  "google/gemini-2.5-flash": "gemini-2.5-flash",
  "google/gemini-3-flash-preview": "gemini-2.0-flash",
  "google/gemini-3.1-flash-image-preview": "gemini-2.0-flash-preview-image-generation",
};

const REVERSE_MODEL_MAP: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_MAP).map(([canonical, resolved]) => [resolved, canonical]),
);

// ai_model_pricing rows are keyed by the canonical id, but callers hold the
// resolveModel() output — this translates back (identity for unknown names).
export function toCanonicalModel(model: string): string {
  return REVERSE_MODEL_MAP[model] ?? model;
}

type EnvGetter = (key: string) => string | undefined;

// deno-lint-ignore no-explicit-any
export function getAiConfig(env: EnvGetter = (k) => (globalThis as any).Deno?.env?.get(k)): AiConfig {
  const googleKey = env("AI_API_KEY");

  if (googleKey) {
    // Local-dev escape hatch: some AI Studio keys/projects don't have access
    // to every model in MODEL_MAP (e.g. a key without gemini-2.5-pro access).
    // Unset in production — when present it wins over MODEL_MAP for every
    // call site, so no edge function code needs touching to test with it.
    const modelOverride = env("AI_MODEL_OVERRIDE");
    return {
      apiKey: googleKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      resolveModel: (model) => modelOverride || (MODEL_MAP[model] ?? model),
    };
  }

  throw new Error("No AI provider configured. Set AI_API_KEY (Google AI Studio).");
}
