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

type EnvGetter = (key: string) => string | undefined;

// deno-lint-ignore no-explicit-any
export function getAiConfig(env: EnvGetter = (k) => (globalThis as any).Deno?.env?.get(k)): AiConfig {
  const googleKey = env("AI_API_KEY");

  if (googleKey) {
    return {
      apiKey: googleKey,
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      resolveModel: (model) => MODEL_MAP[model] ?? model,
    };
  }

  throw new Error("No AI provider configured. Set AI_API_KEY (Google AI Studio).");
}
