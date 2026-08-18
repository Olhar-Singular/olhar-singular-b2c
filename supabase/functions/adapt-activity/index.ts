import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitize } from "../_shared/sanitize.ts";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";
import { runCreditRpc, type CreditRpcResult } from "../_shared/credits.ts";
import {
  interpretReservation,
  reservationErrorResponse,
  resolveRequestId,
  type OpenReservationPayload,
} from "../_shared/creditReservation.ts";
import { calcAdaptationCost } from "../_shared/adaptationCost.ts";
import {
  persistAdaptation,
  type AdaptationInsertClient,
} from "../_shared/adaptationPersistence.ts";
import {
  buildRequestBody,
  interpretAiResponse,
  buildReaskMessages,
  type ChatMessage,
} from "../_shared/adaptActivityCore.ts";
import { extractImageMarkers, stripFabricatedImages } from "../_shared/imageSourceGuard.ts";
import { stripGapTokens } from "../_shared/gapTokenGuard.ts";
import {
  buildSystemPrompt,
  buildUserPrompt,
  MAX_ACTIVITY_CHARS,
  MAX_ACTIVITY_TYPE_CHARS,
  MAX_OBSERVATION_CHARS,
  attemptTimeoutMs,
  type PromptBarrier,
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
    const { original_activity, activity_type, barriers, observation_notes, barrier_profile_id, fidelity_mode } = body;

    if (!original_activity || !activity_type || !barriers || !Array.isArray(barriers) || barriers.length === 0) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes: original_activity, activity_type, barriers." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ─── Reserve + charge (one transaction, crash-safe) ─────────────────────────
    // The reservation row is what makes a charge recoverable: if this isolate
    // dies before it can refund, the row stays `open` and the reconciliation job
    // gives the credits (or the free slot) back. Its id is the idempotency key.
    const requestId = resolveRequestId(body.request_id, () => crypto.randomUUID());
    if (!requestId.ok) {
      return new Response(JSON.stringify({ error: "request_id inválido." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const barrierDimensions = [...new Set(
      (barriers as Array<{ dimension?: string }>)
        .map((b) => b.dimension)
        .filter((d): d is string => Boolean(d)),
    )];
    const creditCost = calcAdaptationCost(barrierDimensions);

    const { data: openData, error: openError } = await serviceClient.rpc(
      "open_adapt_reservation",
      { p_request_id: requestId.id, p_user_id: user.id, p_amount: creditCost },
    );
    if (openError) {
      console.error("open_adapt_reservation error:", openError, "user:", user.id);
      return new Response(JSON.stringify({ error: "Erro ao processar créditos." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const charge = interpretReservation(openData as OpenReservationPayload | null);
    const chargeError = reservationErrorResponse(charge, creditCost);
    if (chargeError) {
      if (charge.status === "error") console.error("open_adapt_reservation failed for user:", user.id, openData);
      return new Response(JSON.stringify(chargeError.body), {
        status: chargeError.status,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isFirstFree = charge.status === "free";
    const creditsCharged = charge.status === "charged" ? charge.creditsCharged : 0;
    // ─── End reserve + charge ───────────────────────────────────────────────────

    // CREDIT INVARIANT: from this point on the user has paid — either in credits
    // or with their one free adaptation. ANY exit other than a fully validated
    // success MUST give that back, and the ONLY exit that keeps the money is the
    // one that settles the reservation right before returning the document.
    //
    // Both reversal and settlement are idempotent in the database (a conditional
    // `open → …` transition), so this request and the reconciliation job can
    // race without ever paying twice.
    const reverseReservation = async () => {
      try {
        // runCreditRpc is required: supabase-js resolves (never rejects) on a DB
        // error, so an unchecked rpc() would make a failed reversal look fine.
        await runCreditRpc("reverse_credit_reservation", () =>
          serviceClient.rpc("reverse_credit_reservation", {
            p_id: requestId.id,
          }) as Promise<{ data: CreditRpcResult | null; error: unknown }>);
      } catch (e) {
        // Never mask the original failure — the job will pick this reservation
        // up on its next pass, since it is still `open`.
        console.error("Reversal failed for user:", user.id, "reservation:", requestId.id, e);
      }
    };

    // Helper: reverse then build an error Response in one shot, so no error path
    // can return without giving the charge back first.
    const failure = async (status: number, message: string): Promise<Response> => {
      await reverseReservation();
      return new Response(
        JSON.stringify({ error: message }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    };

    try {
      const sanitizedActivity = sanitize(original_activity, MAX_ACTIVITY_CHARS);
      const allowedImageSrcs = extractImageMarkers(sanitizedActivity);
      const sanitizedType = sanitize(activity_type, MAX_ACTIVITY_TYPE_CHARS);
      const sanitizedObservations = observation_notes ? sanitize(observation_notes, MAX_OBSERVATION_CHARS) : "";

      const userPrompt = buildUserPrompt({
        activityType: sanitizedType,
        barriers: barriers as PromptBarrier[],
        observations: sanitizedObservations,
        activity: sanitizedActivity,
      });

      const systemPrompt = buildSystemPrompt(barriers, { fidelityMode: fidelity_mode === true });
      const jsonSchema = aiActivityJsonSchema();

      // Attempt loop: 1 initial call + up to 2 reasks (MAX_ATTEMPTS total).
      const reaskMessages: ChatMessage[] = [];
      let lastErrors: string[] = [];
      let totalTokens: number | null = null;
      const requestStart = Date.now();

      for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        // Each attempt gets its own budget, bounded by what is left of the
        // request-wide one. Firing a call we cannot afford to wait for would
        // only trade a reportable validation error for an opaque timeout.
        const budgetMs = attemptTimeoutMs(attempt, Date.now() - requestStart);
        if (budgetMs === 0) break;

        const requestBody = buildRequestBody(
          { model: modelName, systemPrompt, userPrompt, extraMessages: reaskMessages },
          jsonSchema,
        );

        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), budgetMs);
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
          // AWAITED, unlike the mid-loop logs: this branch returns immediately,
          // and a fire-and-forget insert dies with the isolate. That is why no
          // `timeout` row has ever reached ai_usage_logs despite real timeouts.
          await logAiUsage({
            user_id: user.id,
            action_type: "adaptation",
            model: modelName,
            input_tokens: 0,
            output_tokens: 0,
            prompt_text: userPrompt,
            request_duration_ms: aiDurationMs,
            status: isTimeout ? "timeout" : "error",
            error_message: isTimeout
              ? `Request timed out after ${Math.round(budgetMs / 1000)}s (attempt ${attempt})`
              : ((fetchErr as Error)?.message || "Network error"),
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
          // Awaited for the same reason as the timeout branch above.
          await logAiUsage({
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
          const adaptation = stripGapTokens(
            stripFabricatedImages(interpreted.result, allowedImageSrcs),
          );

          // PERSIST BEFORE SETTLING. The response body used to be the ONLY copy
          // of a document the user had already paid for — the browser did the
          // INSERT on its first autosave, so a closed tab, a dead network or an
          // aborted request between here and there lost the work for good.
          // Writing the row first means the charge is only ever made final for
          // an adaptation that is already durable; a failed write refunds via
          // `failure()` and the user is simply told to try again.
          const persisted = await persistAdaptation(
            serviceClient as unknown as AdaptationInsertClient,
            {
              userId: user.id,
              requestId: requestId.id,
              originalActivity: sanitizedActivity,
              activityType: sanitizedType,
              barrierProfileId: barrier_profile_id,
              barriersUsed: barriers,
              observationNotes: sanitizedObservations,
              adaptationResult: adaptation,
              creditsCharged: creditsCharged,
            },
          );
          if (!persisted.ok) {
            console.error(
              "adaptation persist failed for user:",
              user.id,
              "reservation:",
              requestId.id,
              persisted.error,
            );
            return await failure(500, "Não foi possível salvar a adaptação. Tente novamente.");
          }

          // The document exists AND is stored: the charge is final. Settle
          // BEFORE responding, so a reservation is never left open for a
          // delivery that happened (which the job would otherwise refund).
          try {
            await runCreditRpc("settle_credit_reservation", () =>
              serviceClient.rpc("settle_credit_reservation", {
                p_id: requestId.id,
              }) as Promise<{ data: CreditRpcResult | null; error: unknown }>);
          } catch (e) {
            // Failing to settle only risks refunding a charge we were entitled
            // to keep — never the user's money. Log and deliver anyway.
            console.error("Settle failed for user:", user.id, "reservation:", requestId.id, e);
          }

          // Awaited: this is the last thing before the response, and a
          // fire-and-forget insert dies with the isolate — which is why
          // successful generations have been missing from the cost dashboard.
          await logAiUsage({
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
              adaptation,
              // The row the client will autosave into — it no longer creates
              // one. `updated_at` seeds the optimistic-concurrency token so the
              // first autosave does not have to guess it.
              adaptation_id: persisted.row.id,
              adaptation_updated_at: persisted.row.updatedAt,
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
    // the reserve+charge (e.g. auth, body parse, the RPC call itself), so there
    // is normally nothing to give back. If a charge DID land, its reservation is
    // still `open` and the reconciliation job will reverse it — which is exactly
    // the safety net that also covers this isolate dying outright.
    // Do NOT move any post-charge code above this boundary.
    console.error("adapt-activity error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
