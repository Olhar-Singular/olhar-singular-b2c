import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";
import { runCreditRpc, type CreditRpcResult } from "../_shared/credits.ts";
import {
  interpretReservation,
  reservationErrorResponse,
  resolveRequestId,
  type OpenReservationPayload,
} from "../_shared/creditReservation.ts";
import {
  buildExtractionMessages,
  parseExtractionResponse,
  EXTRACTION_TOOL_SCHEMA,
} from "../_shared/examExtractionCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const EXTRACTION_COST = 5;

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

    // ── Parse request body ────────────────────────────────────────────────────
    let pdfText = "";
    let pdfFileName = "";
    let pageImages: string[] = [];
    let providedUploadId: string | null = null;
    let rawRequestId: unknown = undefined;

    const contentType = req.headers.get("content-type") || "";

    if (contentType.includes("multipart/form-data")) {
      const formData = await req.formData();
      const file = formData.get("file") as File | null;
      if (file) {
        pdfFileName = file.name || "upload";
        const buf = await file.arrayBuffer();
        const bytes = new Uint8Array(buf);
        let binary = "";
        const chunkSize = 8192;
        for (let i = 0; i < bytes.length; i += chunkSize) {
          const chunk = bytes.subarray(i, Math.min(i + chunkSize, bytes.length));
          for (let j = 0; j < chunk.length; j++) binary += String.fromCharCode(chunk[j]);
        }
        const base64 = btoa(binary);
        const mimeType = file.type || "image/png";
        pageImages = [`data:${mimeType};base64,${base64}`];
      }
      rawRequestId = formData.get("request_id") ?? undefined;
    } else {
      const body = await req.json();
      pdfText = body.pdfText || "";
      pdfFileName = body.pdfFileName || "";
      pageImages = body.pageImages || [];
      providedUploadId = body.uploadId || null;
      rawRequestId = body.request_id;
    }

    // ── Reserve + charge (one transaction, crash-safe) ────────────────────────
    // Same model as adapt-activity: the reservation row is written before the
    // money moves, so a dead isolate is reconciled by the job; plan bucket
    // first, extras after; courtesy accounts come back as "exempt".
    const requestId = resolveRequestId(rawRequestId, () => crypto.randomUUID());
    if (!requestId.ok) {
      return json({ error: "request_id inválido." }, 400);
    }

    const { data: openData, error: openError } = await admin.rpc("open_credit_reservation", {
      p_request_id: requestId.id,
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
      // The question bank client keys on this exact error string for the paywall.
      const body = chargeError.status === 402
        ? { ...chargeError.body, error: "insufficient_credits" }
        : chargeError.body;
      return json(body, chargeError.status);
    }

    const creditsCharged = charge.status === "charged" ? charge.creditsCharged : 0;
    const isExempt = charge.status === "exempt";

    const reverseReservation = async () => {
      try {
        await runCreditRpc("reverse_credit_reservation", () =>
          admin.rpc("reverse_credit_reservation", { p_id: requestId.id }) as unknown as Promise<{
            data: CreditRpcResult | null;
            error: unknown;
          }>);
      } catch (e) {
        // The job picks the still-open reservation up on its next pass.
        console.error("Extraction reversal failed for user:", user.id, "reservation:", requestId.id, e);
      }
    };

    // ── Register / update upload record ───────────────────────────────────────
    // The client creates the pdf_uploads row at upload time and passes its id
    // here, so we update it instead of inserting a duplicate. Only the direct
    // multipart path (no client row) falls back to inserting a fresh record.
    let uploadId = providedUploadId;
    if (providedUploadId) {
      await admin
        .from("pdf_uploads")
        .update({ was_free: isExempt, credits_spent: creditsCharged })
        .eq("id", providedUploadId)
        .eq("user_id", user.id);
    } else {
      const { data: uploadRecord } = await admin
        .from("pdf_uploads")
        .insert({
          user_id: user.id,
          file_name: pdfFileName || "upload",
          file_path: "",
          was_free: isExempt,
          credits_spent: creditsCharged,
        })
        .select("id")
        .single();
      uploadId = uploadRecord?.id ?? null;
    }

    // ── Build AI messages ─────────────────────────────────────────────────────
    const messages = buildExtractionMessages(pdfText, pdfFileName, pageImages);

    // ── Call Gemini ───────────────────────────────────────────────────────────
    const extractModel = ai.resolveModel("google/gemini-2.5-pro");
    const extractStartTime = Date.now();
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
      });
    } catch (e) {
      console.error("AI gateway unreachable:", e);
      await reverseReservation();
      return json({ error: "Falha na extração por IA." }, 502);
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
      action_type: "question_extraction",
      model: extractModel,
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
      request_duration_ms: Date.now() - extractStartTime,
      status: "success",
      metadata: { file_name: pdfFileName },
    }).catch(() => {});

    let questions: ReturnType<typeof parseExtractionResponse>;
    try {
      questions = parseExtractionResponse(aiData);
    } catch (e) {
      console.error("extraction parse failed:", e);
      await reverseReservation();
      return json({ error: "Falha na extração por IA." }, 500);
    }

    // ── Update questions_extracted count ──────────────────────────────────────
    if (uploadId && questions.length > 0) {
      await admin
        .from("pdf_uploads")
        .update({ questions_extracted: questions.length })
        .eq("id", uploadId);
    }

    // The result exists: the charge is final. Settle BEFORE responding so the
    // job never refunds a delivered extraction.
    try {
      await runCreditRpc("settle_credit_reservation", () =>
        admin.rpc("settle_credit_reservation", { p_id: requestId.id }) as unknown as Promise<{
          data: CreditRpcResult | null;
          error: unknown;
        }>);
    } catch (e) {
      console.error("Settle failed for user:", user.id, "reservation:", requestId.id, e);
    }

    return json({ questions, source_file_name: pdfFileName, credits_charged: creditsCharged });
  } catch (e) {
    console.error("extract-questions error:", e);
    return json({ error: e instanceof Error ? e.message : "Erro desconhecido" }, 500);
  }
});
