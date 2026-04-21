import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitize } from "../_shared/sanitize.ts";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OCR_SYSTEM_PROMPT = `You are an expert OCR system for Brazilian educational exams (ENEM, vestibulares, simulados).
Images may have 2-3 columns, figures, tables, and multiple questions per page.

RULES:
- Read the image left column top-to-bottom, then right column top-to-bottom
- Extract EVERY question visible — never stop after the first one
- Each question must include: number, source, statement, alternatives (a-e), subject, topic
- If a question has a figure/diagram, set has_figure to true and provide the bounding box
- Preserve all units and math symbols exactly (m/s², 10⁸, etc)
- Ignore headers, footers, school name, teacher name, watermarks

Additional rules:
- "options": extract alternatives as array of strings
- "correct_answer": if answer key is in the document use it; otherwise SOLVE it. Index: 0=A, 1=B, 2=C, 3=D, 4=E. Use -1 only if impossible.
- "resolution": short explanation (1-3 sentences)
- "has_figure": true if question has associated figure/diagram/graph/table/image
- "figure_description": describe what the figure shows
- "image_page": which page image (1-indexed) contains the figure. 0 if no figure.
- "figure_bbox": normalized bounding box (0.0 to 1.0) relative to page: { "x": left, "y": top, "width": width, "height": height }`;

const EXTRACT_PROMPT = `Extraia todas as questões deste documento/imagem. Para cada questão extraia todos os campos solicitados pela função save_questions. Seja meticuloso: extraia TODAS as questões visíveis.`;

const TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "save_questions",
    description: "Return all extracted questions as structured data",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "Full question text / enunciado completo" },
              subject: { type: "string", description: "Subject area (Física, Matemática, etc)" },
              topic: { type: "string", description: "Specific topic" },
              options: { type: "array", items: { type: "string" }, description: "Answer alternatives" },
              correct_answer: { type: "integer", description: "0-based index of correct answer. -1 if unknown" },
              resolution: { type: "string", description: "Short explanation (1-3 sentences)" },
              has_figure: { type: "boolean", description: "Whether question has an associated figure" },
              figure_description: { type: "string", description: "Description of the figure" },
              image_page: { type: "integer", description: "1-indexed page containing the figure. 0 if none" },
              figure_bbox: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                },
                description: "Normalized bounding box (0.0-1.0) of the figure on the page",
              },
            },
            required: ["text", "subject"],
          },
        },
      },
      required: ["questions"],
    },
  },
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
    }

    // ── Register upload record ────────────────────────────────────────────────
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

    const uploadId = uploadRecord?.id ?? null;

    // ── Deduct credits or mark free extraction ────────────────────────────────
    if (isFreeExtraction) {
      await admin
        .from("profiles")
        .update({ free_extraction_used: true })
        .eq("id", user.id);
    } else {
      const deductResult = await admin.rpc("deduct_credits", {
        p_user_id: user.id,
        p_amount: EXTRACTION_COST,
        p_type: "extract",
        p_ref_id: uploadId,
      });
      if (deductResult.data?.success === false) {
        return new Response(
          JSON.stringify({ error: "insufficient_credits", balance: profile.credit_balance }),
          { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // ── Build AI messages ─────────────────────────────────────────────────────
    const contentParts: any[] = [
      { type: "text", text: `${EXTRACT_PROMPT}\n\nTexto extraído do documento "${sanitize(pdfFileName, 200)}":\n${sanitize(pdfText, 50000)}` },
    ];
    for (let i = 0; i < pageImages.length; i++) {
      contentParts.push({ type: "text", text: `\n[Página ${i + 1}]` });
      contentParts.push({ type: "image_url", image_url: { url: pageImages[i] } });
    }

    const messages: any[] = [
      { role: "system", content: OCR_SYSTEM_PROMPT },
      { role: "user", content: contentParts },
    ];

    // ── Call Gemini ───────────────────────────────────────────────────────────
    const extractStartTime = Date.now();
    const aiResponse = await fetch(`${ai.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { Authorization: `Bearer ${ai.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        model: ai.resolveModel("google/gemini-2.5-flash"),
        messages,
        tools: [TOOL_SCHEMA],
        tool_choice: { type: "function", function: { name: "save_questions" } },
      }),
    });

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
      action_type: "question_extraction",
      model: "google/gemini-2.5-flash",
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
      request_duration_ms: Date.now() - extractStartTime,
      status: "success",
      metadata: { file_name: pdfFileName },
    }).catch(() => {});

    const toolCall = aiData.choices?.[0]?.message?.tool_calls?.[0];
    let questions: any[] = [];
    if (toolCall?.function?.arguments) {
      try {
        const parsed = JSON.parse(toolCall.function.arguments);
        questions = parsed.questions || [];
      } catch { questions = []; }
    }

    // ── Update questions_extracted count ──────────────────────────────────────
    if (uploadId && questions.length > 0) {
      await admin
        .from("pdf_uploads")
        .update({ questions_extracted: questions.length })
        .eq("id", uploadId);
    }

    return new Response(JSON.stringify({ questions, source_file_name: pdfFileName }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (e) {
    console.error("extract-questions error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
