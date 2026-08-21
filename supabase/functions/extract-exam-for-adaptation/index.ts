import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";
import {
  buildExtractionMessages,
  parseExtractionResponse,
  EXTRACTION_TOOL_SCHEMA,
  EXTRACTION_TIMEOUT_MS,
} from "../_shared/examExtractionCore.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const ai = getAiConfig();

    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader! } },
    });

    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Não autorizado" }), {
        status: 401, headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // ── Parse request body ────────────────────────────────────────────────────
    // This flow only ever receives JSON — the client already turned the
    // upload (PDF/DOCX) into native text + page images via pdf-utils/docx-utils
    // before calling this function. No multipart branch, no credit charge, no
    // pdf_uploads bookkeeping: the cost is bundled into the subsequent
    // adapt-activity call.
    const body = await req.json();
    const pdfText = body.pdfText || "";
    const pdfFileName = body.pdfFileName || "";
    const pageImages: string[] = body.pageImages || [];

    // ── Build AI messages ─────────────────────────────────────────────────────
    const messages = buildExtractionMessages(pdfText, pdfFileName, pageImages);

    // ── Call Gemini ───────────────────────────────────────────────────────────
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
      return new Response(
        JSON.stringify({
          error: isTimeout
            ? "A extração demorou demais. Tente novamente com um arquivo menor ou com menos páginas."
            : "Falha na conexão com a IA.",
        }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } },
      );
    } finally {
      clearTimeout(timeoutId);
    }

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI gateway error:", aiResponse.status, errText);
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
      action_type: "exam_extraction_for_adaptation",
      model: extractModel,
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
      request_duration_ms: Date.now() - extractStartTime,
      status: "success",
      metadata: { file_name: pdfFileName },
    }).catch(() => {});

    const questions = parseExtractionResponse(aiData);

    return new Response(
      JSON.stringify({ questions, source_file_name: pdfFileName }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  } catch (e) {
    console.error("extract-exam-for-adaptation error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
