import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitize } from "../_shared/sanitize.ts";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";
import { chargeCredits, chargeErrorResponse, type CreditRpcResult } from "../_shared/credits.ts";
import { createRefundGuard } from "../_shared/creditGuard.ts";
import { calcAdaptationCost } from "../_shared/adaptationCost.ts";
import {
  buildRequestBody,
  interpretAiResponse,
  buildReaskMessages,
  type ChatMessage,
} from "../_shared/adaptActivityCore.ts";
import {
  buildSystemPrompt,
  MAX_ACTIVITY_CHARS,
  MAX_ACTIVITY_TYPE_CHARS,
  MAX_OBSERVATION_CHARS,
  AI_REQUEST_TIMEOUT_MS,
} from "../_shared/adaptationPrompt.ts";
import { aiActivityJsonSchema } from "../../../src/lib/adaptation/canonical/ai.ts";

// Max total attempts at getting a valid structured response (1 initial + 2 reasks).
const MAX_ATTEMPTS = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ai = getAiConfig();
    const modelName = ai.resolveModel("google/gemini-2.5-pro");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { original_activity, activity_type, barriers, observation_notes } = body;

    if (!original_activity || !activity_type || !barriers || !Array.isArray(barriers) || barriers.length === 0) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes: original_activity, activity_type, barriers." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Credit deduction (reserve upfront to avoid races) ──────────────────────
    const barrierDimensions = [...new Set(
      (barriers as Array<{ dimension?: string }>)
        .map((b) => b.dimension)
        .filter((d): d is string => Boolean(d)),
    )];
    const creditCost = calcAdaptationCost(barrierDimensions);

    const charge = await chargeCredits({
      cost: creditCost,
      claimFree: async () => {
        const { data } = await serviceClient
          .from("profiles")
          .update({ free_adaptation_used: true })
          .eq("id", user.id)
          .eq("free_adaptation_used", false)
          .select("id");
        return (data?.length ?? 0) > 0;
      },
      deduct: async () => {
        const { data, error } = await serviceClient.rpc("deduct_credits", {
          p_user_id: user.id,
          p_amount: creditCost,
          p_type: "adapt",
        });
        return { data: data as CreditRpcResult | null, error };
      },
    });

    const chargeError = chargeErrorResponse(charge, creditCost);
    if (chargeError) {
      if (charge.status === "error") console.error("deduct_credits error:", charge.cause ?? "unexpected failure", "user:", user.id);
      return new Response(JSON.stringify(chargeError.body), {
        status: chargeError.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isFirstFree = charge.status === "free";
    const creditsCharged = charge.status === "charged" ? charge.creditsCharged : 0;
    // ─── End credit deduction ───────────────────────────────────────────────────

    // CREDIT INVARIANT: from this point on the user has been charged. ANY exit
    // other than a fully validated success MUST refund. The refund guard makes
    // this idempotent (at most one grant) and best-effort (never masks errors).
    const refundGuard = createRefundGuard({
      creditsCharged,
      grant: async (amount) => {
        await serviceClient.rpc("grant_credits", {
          p_user_id: user.id,
          p_amount: amount,
          p_type: "refund",
        });
      },
      onError: (e) => console.error("Refund failed for user:", user.id, e),
    });

    // Helper: refund then build an error Response in one shot, so no error path
    // can return without refunding first.
    const failure = async (status: number, message: string): Promise<Response> => {
      await refundGuard.refundIfNeeded();
      return new Response(
        JSON.stringify({ error: message }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    try {
      const sanitizedActivity = sanitize(original_activity, MAX_ACTIVITY_CHARS);
      const sanitizedType = sanitize(activity_type, MAX_ACTIVITY_TYPE_CHARS);
      const sanitizedObservations = observation_notes ? sanitize(observation_notes, MAX_OBSERVATION_CHARS) : "";

      const activeBarriersList = (barriers as Array<{ dimension?: string; barrier_key?: string; notes?: string }>)
        .map((b) => {
          const parts = [b.barrier_key || b.dimension || "barreira"];
          if (b.dimension) parts.push(`(dimensão: ${b.dimension})`);
          if (b.notes) parts.push(`— nota: ${b.notes}`);
          return parts.join(" ");
        })
        .join("\n- ");

      let userPrompt = `TIPO DE ATIVIDADE: ${sanitizedType}

BARREIRAS OBSERVÁVEIS:
- ${activeBarriersList}`;

      if (sanitizedObservations) {
        userPrompt += `\n\nOBSERVAÇÕES DO PROFESSOR:\n${sanitizedObservations}`;
      }

      userPrompt += `\n\nATIVIDADE ORIGINAL:\n${sanitizedActivity}`;

      const systemPrompt = buildSystemPrompt(barriers);
      const jsonSchema = aiActivityJsonSchema();

      // Attempt loop: 1 initial call + up to 2 reasks (MAX_ATTEMPTS total).
      const reaskMessages: ChatMessage[] = [];
      let lastErrors: string[] = [];
      let totalTokens: number | null = null;

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        const requestBody = buildRequestBody(
          { model: modelName, systemPrompt, userPrompt, extraMessages: reaskMessages },
          jsonSchema,
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), AI_REQUEST_TIMEOUT_MS);
        const aiStartTime = Date.now();
        let aiResponse: Response;
        let aiDurationMs: number;

        try {
          aiResponse = await fetch(`${ai.baseUrl}/chat/completions`, {
            method: "POST",
            headers: {
              Authorization: `Bearer ${ai.apiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify(requestBody),
            signal: controller.signal,
          });
          aiDurationMs = Date.now() - aiStartTime;
        } catch (fetchErr: unknown) {
          aiDurationMs = Date.now() - aiStartTime;
          const isTimeout = (fetchErr as { name?: string })?.name === "AbortError";
          logAiUsage({
            user_id: user.id,
            action_type: "adaptation",
            model: modelName,
            input_tokens: 0,
            output_tokens: 0,
            prompt_text: userPrompt,
            request_duration_ms: aiDurationMs,
            status: isTimeout ? "timeout" : "error",
            error_message: isTimeout ? "Request timed out after 90s" : ((fetchErr as Error)?.message || "Network error"),
            metadata: { activity_type: sanitizedType, barriers_count: barriers.length, attempt },
          }).catch(() => {});
          return await failure(
            502,
            isTimeout ? "A IA demorou demais para responder. Tente novamente." : "Falha na conexão com a IA.",
          );
        } finally {
          clearTimeout(timeoutId);
        }

        if (!aiResponse.ok) {
          const errText = await aiResponse.text();
          console.error("AI gateway error:", aiResponse.status, errText);
          logAiUsage({
            user_id: user.id,
            action_type: "adaptation",
            model: modelName,
            input_tokens: 0,
            output_tokens: 0,
            prompt_text: userPrompt,
            request_duration_ms: aiDurationMs,
            status: "error",
            error_message: `HTTP ${aiResponse.status}: ${errText.slice(0, 200)}`,
            metadata: { activity_type: sanitizedType, barriers_count: barriers.length, http_status: aiResponse.status, attempt },
          }).catch(() => {});

          if (aiResponse.status === 429) {
            return await failure(429, "Limite de requisições IA atingido. Tente novamente em alguns minutos.");
          }
          return await failure(500, "Falha na geração da adaptação.");
        }

        const aiData = await aiResponse.json();
        const responseContent: string =
          (aiData as { choices?: Array<{ message?: { content?: string } }> })?.choices?.[0]?.message?.content || "";
        totalTokens = (aiData as { usage?: { total_tokens?: number } })?.usage?.total_tokens ?? null;

        if (!responseContent) {
          return await failure(500, "Resposta vazia da IA.");
        }

        const interpreted = interpretAiResponse(responseContent);
        if (interpreted.ok) {
          logAiUsage({
            user_id: user.id,
            action_type: "adaptation",
            model: modelName,
            input_tokens: (aiData as { usage?: { prompt_tokens?: number } })?.usage?.prompt_tokens || 0,
            output_tokens: (aiData as { usage?: { completion_tokens?: number } })?.usage?.completion_tokens || 0,
            request_duration_ms: aiDurationMs,
            status: "success",
            metadata: { activity_type: sanitizedType, barriers_count: barriers.length, attempt },
          }).catch(() => {});

          return new Response(
            JSON.stringify({
              adaptation: interpreted.result,
              model_used: modelName,
              tokens_used: totalTokens,
              credits_charged: creditsCharged,
              is_first_free: isFirstFree,
              disclaimer: "Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.",
            }),
            { headers: { ...corsHeaders, "Content-Type": "application/json" } },
          );
        }

        // Validation failed — record and (if attempts remain) reask.
        lastErrors = interpreted.errors;
        logAiUsage({
          user_id: user.id,
          action_type: "adaptation",
          model: modelName,
          input_tokens: 0,
          output_tokens: 0,
          request_duration_ms: aiDurationMs,
          status: "error",
          error_message: `Validation failed (attempt ${attempt}): ${interpreted.errors.slice(0, 5).join("; ").slice(0, 300)}`,
          metadata: { activity_type: sanitizedType, barriers_count: barriers.length, attempt },
        }).catch(() => {});

        if (attempt < MAX_ATTEMPTS) {
          reaskMessages.push(...buildReaskMessages(responseContent, interpreted.errors));
        }
      }

      // Exhausted all attempts without a valid document.
      console.error("adapt-activity validation exhausted for user:", user.id, lastErrors.slice(0, 5));
      return await failure(502, "Não foi possível gerar uma adaptação válida. Tente novamente.");
    } catch (inner) {
      // Backstop: any unexpected error after the charge must still refund.
      console.error("adapt-activity post-charge error:", inner);
      return await failure(500, inner instanceof Error ? inner.message : "Erro desconhecido");
    }
  } catch (e) {
    // This outer catch is only reachable for errors that occur BEFORE or DURING
    // the credit charge (e.g. auth, body parse, chargeCredits itself). No charge
    // has been committed at this point, so refund is intentionally NOT called
    // here. Do NOT move any post-charge code above this boundary.
    console.error("adapt-activity error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
