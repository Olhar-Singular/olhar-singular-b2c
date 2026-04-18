import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

interface AiUsageLog {
  user_id: string;
  school_id?: string | null;
  action_type: string;
  model: string;
  endpoint?: string;
  input_tokens?: number;
  output_tokens?: number;
  request_duration_ms?: number;
  status?: "success" | "error" | "timeout";
  error_message?: string;
  metadata?: Record<string, unknown>;
  prompt_text?: string;
  response_text?: string;
}

// Estimate tokens when API doesn't return them (~3.5 chars per token for Portuguese)
function estimateTokens(text: string): number {
  return Math.ceil(text.length / 3.5);
}

// deno-lint-ignore no-explicit-any
async function getModelPricing(
  admin: any,
  model: string
): Promise<{ input: number; output: number }> {
  try {
    const { data } = await admin
      .from("ai_model_pricing")
      .select("price_input_per_million, price_output_per_million")
      .eq("model", model)
      .eq("is_active", true)
      .single();

    if (data) {
      return {
        input: Number((data as any).price_input_per_million),
        output: Number((data as any).price_output_per_million),
      };
    }
  } catch {
    // fallback below
  }

  // Hardcoded fallback if DB lookup fails
  const FALLBACK: Record<string, { input: number; output: number }> = {
    "google/gemini-2.5-flash": { input: 0.075, output: 0.30 },
    "google/gemini-2.5-pro": { input: 1.25, output: 5.00 },
    "google/gemini-3-flash-preview": { input: 0.10, output: 0.40 },
    "google/gemini-3.1-flash-image-preview": { input: 0.10, output: 0.40 },
  };
  return FALLBACK[model] || { input: 0, output: 0 };
}

export async function logAiUsage(log: AiUsageLog): Promise<void> {
  try {
    const admin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Auto-resolve school_id if not provided
    let schoolId = log.school_id || null;
    if (!schoolId && log.user_id) {
      const { data, error: schoolErr } = await admin.rpc("get_user_school_id", { _user_id: log.user_id });
      if (schoolErr) {
        console.warn("Failed to resolve school_id for user", log.user_id, schoolErr.message);
      }
      schoolId = data || null;
      if (!schoolId) {
        console.warn("AI usage log will have null school_id for user", log.user_id);
      }
    }

    // Determine token source and values
    let inputTokens = log.input_tokens || 0;
    let outputTokens = log.output_tokens || 0;
    let tokensSource: "api" | "estimated" | "unknown" = "api";

    if (inputTokens === 0 && outputTokens === 0) {
      if (log.prompt_text || log.response_text) {
        if (log.prompt_text) inputTokens = estimateTokens(log.prompt_text);
        if (log.response_text) outputTokens = estimateTokens(log.response_text);
        tokensSource = "estimated";
      } else {
        tokensSource = "unknown";
      }
    } else if (inputTokens === 0 && log.prompt_text) {
      inputTokens = estimateTokens(log.prompt_text);
      tokensSource = "estimated";
    }

    const totalTokens = inputTokens + outputTokens;

    // Fetch pricing from DB (with fallback)
    const pricing = await getModelPricing(admin, log.model);
    const costInput = (inputTokens / 1_000_000) * pricing.input;
    const costOutput = (outputTokens / 1_000_000) * pricing.output;
    const costTotal = costInput + costOutput;

    await admin.from("ai_usage_logs").insert({
      user_id: log.user_id,
      school_id: schoolId,
      action_type: log.action_type,
      model: log.model,
      endpoint: log.endpoint || null,
      input_tokens: inputTokens,
      output_tokens: outputTokens,
      total_tokens: totalTokens,
      cost_input: costInput,
      cost_output: costOutput,
      cost_total: costTotal,
      request_duration_ms: log.request_duration_ms || null,
      status: log.status || "success",
      error_message: log.error_message || null,
      metadata: log.metadata || {},
      tokens_source: tokensSource,
    });
  } catch (err) {
    console.error("Failed to log AI usage:", err);
  }
}
