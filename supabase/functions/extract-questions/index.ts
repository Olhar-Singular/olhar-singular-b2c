import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";
import { chargeCredits, refundCredits, runCreditRpc, type CreditRpcResult } from "../_shared/credits.ts";
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
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Credit check ──────────────────────────────────────────────────────────
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("credit_balance, free_extraction_used")
      .eq("id", user.id)
      .single();

    if (profileError || !profile) {
      return new Response(JSON.stringify({ error: "Perfil não encontrado" }), {
        status: 404, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const isFreeExtraction = !profile.free_extraction_used;

    if (!isFreeExtraction && profile.credit_balance < EXTRACTION_COST) {
      return new Response(
        JSON.stringify({ error: "insufficient_credits", balance: profile.credit_balance }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // ── Parse request body ────────────────────────────────────────────────────
    let pdfText = "";
    let pdfFileName = "";
    let pageImages: string[] = [];
    let providedUploadId: string | null = null;

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
    } else {
      const body = await req.json();
      pdfText = body.pdfText || "";
      pdfFileName = body.pdfFileName || "";
      pageImages = body.pageImages || [];
      providedUploadId = body.uploadId || null;
    }

    // ── Register / update upload record ───────────────────────────────────────
    // The client creates the pdf_uploads row at upload time and passes its id
    // here, so we update it instead of inserting a duplicate. Only the direct
    // multipart path (no client row) falls back to inserting a fresh record.
    let uploadId = providedUploadId;
    if (providedUploadId) {
      await admin
        .from("pdf_uploads")
        .update({
          was_free: isFreeExtraction,
          credits_spent: isFreeExtraction ? 0 : EXTRACTION_COST,
        })
        .eq("id", providedUploadId)
        .eq("user_id", user.id);
    } else {
      const { data: uploadRecord } = await admin
        .from("pdf_uploads")
        .insert({
          user_id: user.id,
          file_name: pdfFileName || "upload",
          file_path: "",
          was_free: isFreeExtraction,
          credits_spent: isFreeExtraction ? 0 : EXTRACTION_COST,
        })
        .select("id")
        .single();
      uploadId = uploadRecord?.id ?? null;
    }

    // ── Deduct credits or claim the free extraction (atomic) ─────────────────
    // claimFree wins the one-time free slot when available; on a lost race (or
    // no free tier) it falls through to deduct. Decision logic is shared + tested.
    const charge = await chargeCredits({
      cost: EXTRACTION_COST,
      claimFree: async () => {
        if (!isFreeExtraction) return false;
        const { data: claimed } = await admin
          .from("profiles")
          .update({ free_extraction_used: true })
          .eq("id", user.id)
          .eq("free_extraction_used", false)
          .select("id");
        return (claimed?.length ?? 0) > 0;
      },
      deduct: async () => {
        const { data, error } = await admin.rpc("deduct_credits", {
          p_user_id: user.id,
          p_amount: EXTRACTION_COST,
          p_type: "extract",
          p_ref_id: uploadId,
        });
        return { data: data as CreditRpcResult | null, error };
      },
    });

    // extract surfaces a single bespoke 402 for both insufficient and failure.
    if (charge.status === "insufficient" || charge.status === "error") {
      if (charge.status === "error" && charge.reason === "rpc") {
        console.error("deduct_credits error:", charge.cause);
      }
      return new Response(
        JSON.stringify({ error: "insufficient_credits", balance: profile.credit_balance }),
        { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    }

    const creditsCharged = charge.status === "charged" ? charge.creditsCharged : 0;

    const refundIfNeeded = () =>
      refundCredits({
        creditsCharged,
        grant: async (amount) => {
          // Must go through runCreditRpc: supabase-js resolves (never rejects)
          // on a DB error, so an unchecked rpc() hides a failed refund.
          await runCreditRpc("grant_credits", () =>
            admin.rpc("grant_credits", {
              p_user_id: user.id,
              p_amount: amount,
              p_type: "refund",
            }) as Promise<{ data: CreditRpcResult | null; error: unknown }>);
        },
        onError: (e) => console.error("Extraction refund failed for user:", user.id, e),
      });

    // ── Build AI messages ─────────────────────────────────────────────────────
    const messages = buildExtractionMessages(pdfText, pdfFileName, pageImages);

    // ── Call Gemini ───────────────────────────────────────────────────────────
    const extractModel = ai.resolveModel("google/gemini-2.5-pro");
    const extractStartTime = Date.now();
    const aiResponse = await fetch(`${ai.baseUrl}/chat/completions`, {
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

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
      await refundIfNeeded();
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições IA atingido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Falha na extração por IA." }), {
        status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
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

    const questions = parseExtractionResponse(aiData);

    // ── Update questions_extracted count ──────────────────────────────────────
    if (uploadId && questions.length > 0) {
      await admin
        .from("pdf_uploads")
        .update({ questions_extracted: questions.length })
        .eq("id", uploadId);
    }

    return new Response(
      JSON.stringify({ questions, source_file_name: pdfFileName, credits_charged: creditsCharged }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-questions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
