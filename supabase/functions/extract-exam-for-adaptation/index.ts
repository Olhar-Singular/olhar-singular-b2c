import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";
import { runCreditRpc, type CreditRpcResult } from "../_shared/credits.ts";
import {
  interpretReservation,
  reservationErrorResponse,
  type OpenReservationPayload,
} from "../_shared/creditReservation.ts";
import {
  buildExtractionMessages,
  parseExtractionResponse,
  validateExamExtractionRequest,
  EXTRACTION_COST,
  EXTRACTION_TOOL_SCHEMA,
  EXTRACTION_TIMEOUT_MS,
} from "../_shared/examExtractionCore.ts";
import { errorResponse } from "../_shared/publicError.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const ai = getAiConfig();

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader! } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return json({ error: "Não autorizado" }, 401);
    }

    // ── Parse + validate the request body (before any charge) ─────────────────
    // This flow only ever receives JSON: the client already turned the upload
    // (PDF/DOCX) into native text + page images via pdf-utils/docx-utils. No
    // multipart branch and no pdf_uploads bookkeeping (that is the question
    // bank's). Bounds, the image allowlist and the request_id are checked here,
    // so a malformed or oversized request never costs the user anything.
    let body: unknown;
    try {
      body = await req.json();
    } catch {
      return json({ error: "Requisição inválida." }, 400);
    }
    const input = validateExamExtractionRequest(body);
    if (!input.ok) {
      return json({ error: input.error }, 400);
    }
    const { pdfText, pdfFileName, pageImages, requestId } = input.value;

    // ── Reserve + charge (one transaction, crash-safe) ────────────────────────
    // Same model and price as extract-questions (kind 'extract'): the
    // reservation row is written before the money moves, so a dead isolate is
    // reconciled by the job; plan bucket first, extras after; courtesy accounts
    // come back as "exempt". The request_id is the idempotency key: a replay is
    // a 409, never a second charge.
    const { data: openData, error: openError } = await admin.rpc("open_credit_reservation", {
      p_request_id: requestId,
      p_user_id: user.id,
      p_amount: EXTRACTION_COST,
      p_kind: "extract",
    });
    if (openError) {
      console.error("open_credit_reservation error:", openError, "user:", user.id);
      return json({ error: "Erro ao processar créditos." }, 500);
    }

    const charge = interpretReservation(openData as OpenReservationPayload | null);
    const chargeError = reservationErrorResponse(charge, EXTRACTION_COST);
    if (chargeError) {
      if (charge.status === "error") console.error("open_credit_reservation failed for user:", user.id, openData);
      // 402 carries reason "insufficient_credits": the wizard keys on the status.
      return json(chargeError.body, chargeError.status);
    }

    const creditsCharged = charge.status === "charged" ? charge.creditsCharged : 0;

    // CREDIT INVARIANT: from here on the user has paid. Every exit without an
    // AI result gives it back; the only exit that keeps it settles first.
    const reverseReservation = async () => {
      try {
        await runCreditRpc("reverse_credit_reservation", () =>
          admin.rpc("reverse_credit_reservation", { p_id: requestId }) as unknown as Promise<{
            data: CreditRpcResult | null;
            error: unknown;
          }>);
      } catch (e) {
        // The job picks the still-open reservation up on its next pass.
        console.error("Extraction reversal failed for user:", user.id, "reservation:", requestId, e);
      }
    };

    try {
      // ── Build AI messages ───────────────────────────────────────────────────
      const messages = buildExtractionMessages(pdfText, pdfFileName, pageImages);

      // ── Call Gemini ─────────────────────────────────────────────────────────
      // Bounded by an explicit abort: without it, a hung request runs until the
      // edge runtime's OWN wall-clock limit force-kills the isolate, and the
      // client sees a severed connection instead of a clean, actionable error.
      const extractModel = ai.resolveModel("google/gemini-2.5-pro");
      const extractStartTime = Date.now();
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), EXTRACTION_TIMEOUT_MS);
      let aiResponse: Response;
      try {
        aiResponse = await fetch(`${ai.baseUrl}/chat/completions`, {
          method: "POST",
          headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json" },
          body: JSON.stringify({
            model: extractModel,
            messages,
            tools: [EXTRACTION_TOOL_SCHEMA],
            tool_choice: { type: "function", function: { name: "save_questions" } },
            max_tokens: 16384,
          }),
          signal: controller.signal,
        });
      } catch (fetchErr: unknown) {
        const isTimeout = (fetchErr as { name?: string })?.name === "AbortError";
        console.error("extract-exam-for-adaptation fetch error:", fetchErr);
        await reverseReservation();
        return json(
          {
            error: isTimeout
              ? "A extração demorou demais. Tente novamente com um arquivo menor ou com menos páginas."
              : "Falha na conexão com a IA.",
          },
          502,
        );
      } finally {
        clearTimeout(timeoutId);
      }

      if (!aiResponse.ok) {
        const errText = await aiResponse.text();
        console.error("AI gateway error:", aiResponse.status, errText);
        await reverseReservation();
        if (aiResponse.status === 429) {
          return json({ error: "Limite de requisições IA atingido. Tente novamente em alguns minutos." }, 429);
        }
        return json({ error: "Falha na extração por IA." }, 500);
      }

      const aiData = await aiResponse.json();

      logAiUsage({
        user_id: user.id,
        action_type: "exam_extraction_for_adaptation",
        model: extractModel,
        input_tokens: aiData.usage?.prompt_tokens || 0,
        output_tokens: aiData.usage?.completion_tokens || 0,
        request_duration_ms: Date.now() - extractStartTime,
        status: "success",
        metadata: { file_name: pdfFileName },
      }).catch(() => {});

      // Never throws: a malformed tool call reads as "no questions". The AI
      // call happened either way, so it is charged like extract-questions does.
      const questions = parseExtractionResponse(aiData);

      // The result exists: the charge is final. Settle BEFORE responding so the
      // job never refunds a delivered extraction.
      try {
        await runCreditRpc("settle_credit_reservation", () =>
          admin.rpc("settle_credit_reservation", { p_id: requestId }) as unknown as Promise<{
            data: CreditRpcResult | null;
            error: unknown;
          }>);
      } catch (e) {
        console.error("Settle failed for user:", user.id, "reservation:", requestId, e);
      }

      return json({ questions, source_file_name: pdfFileName, credits_charged: creditsCharged });
    } catch (inner) {
      // Backstop: an unexpected failure after the charge must still refund.
      await reverseReservation();
      throw inner;
    }
  } catch (e) {
    return errorResponse(e, { label: "extract-exam-for-adaptation error:", headers: corsHeaders });
  }
});
