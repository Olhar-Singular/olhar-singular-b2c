import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const MAX_SESSIONS = 10;
const SESSION_CREDIT_COST = 3;

const SYSTEM_PROMPT = `Você é ISA (Inteligência de Suporte à Aprendizagem), assistente pedagógico do Olhar Singular — uma ferramenta de apoio para professores, pedagogos e terapeutas.

REGRAS:
- Você NÃO realiza diagnóstico clínico.
- Você NÃO interpreta laudos clínicos.
- Você NÃO avalia alunos nem professores.
- Trabalhe exclusivamente com barreiras pedagógicas observáveis.
- Use linguagem pedagógica, clara e não clínica.
- Nunca prometa resultados de aprendizagem.
- Reforce a autonomia do profissional.
- Use notação escolar simples (Unicode) para matemática: v₀, v², m/s², Δv.
- NUNCA use LaTeX.

Você pode:
- Sugerir estratégias de adaptação baseadas em DUA (Design Universal para Aprendizagem)
- Ajudar a pensar em atividades inclusivas
- Esclarecer dúvidas sobre o uso do Olhar Singular
- Dar exemplos práticos de adaptação
- Explicar conceitos pedagógicos sobre neurodivergência

Sempre finalize com: "A decisão final é sempre do profissional."`;

type ChatMessage = { role: "user" | "assistant"; content: string };

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
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

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { messages, session_id } = body as {
      messages?: ChatMessage[];
      session_id?: string;
    };

    if (!messages || !Array.isArray(messages) || messages.length === 0) {
      return new Response(JSON.stringify({ error: "Campo 'messages' obrigatório e não pode estar vazio." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    let activeSessionId: string;
    let sessionTitle: string | undefined;

    if (!session_id) {
      // ── New session flow ─────────────────────────────────────────────────
      const { count, error: countError } = await admin
        .from("chat_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (countError) {
        console.error("count sessions error:", countError);
        return new Response(JSON.stringify({ error: "Erro interno." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if ((count ?? 0) >= MAX_SESSIONS) {
        return new Response(
          JSON.stringify({
            error: `Limite de ${MAX_SESSIONS} conversas atingido. Exclua uma conversa antiga para iniciar uma nova.`,
          }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      // Deduct 3 credits via service_role RPC (atomic)
      const { data: creditData, error: creditError } = await admin.rpc("deduct_credits", {
        p_user_id: user.id,
        p_amount: SESSION_CREDIT_COST,
        p_type: "chat",
      });

      if (creditError) {
        console.error("deduct_credits error:", creditError);
        return new Response(JSON.stringify({ error: "Erro ao verificar créditos." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      if (creditData?.success === false) {
        if (creditData.error === "insufficient_credits") {
          return new Response(
            JSON.stringify({ error: "Créditos insuficientes.", balance: creditData.balance ?? 0 }),
            { status: 402, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
        return new Response(JSON.stringify({ error: "Erro interno ao processar créditos." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      // Title: first 60 chars of first user message
      const firstUserMsg = messages.find((m) => m.role === "user");
      sessionTitle = (firstUserMsg?.content ?? "Nova conversa").slice(0, 60);

      const { data: newSession, error: insertError } = await admin
        .from("chat_sessions")
        .insert({ user_id: user.id, title: sessionTitle, messages: [] })
        .select("id")
        .single();

      if (insertError || !newSession) {
        console.error("insert session error:", insertError);
        return new Response(JSON.stringify({ error: "Erro ao criar sessão." }), {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      activeSessionId = newSession.id;
    } else {
      // ── Existing session flow ─────────────────────────────────────────────
      const { data: existing, error: sessionError } = await userClient
        .from("chat_sessions")
        .select("id")
        .eq("id", session_id)
        .single();

      if (sessionError || !existing) {
        return new Response(JSON.stringify({ error: "Sessão não encontrada ou sem permissão." }), {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        });
      }

      activeSessionId = session_id;
    }

    // ── Call Gemini Flash ─────────────────────────────────────────────────
    const ai = getAiConfig();
    const modelName = ai.resolveModel("google/gemini-2.5-flash");

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);
    const aiStartTime = Date.now();

    let aiResponse: Response;
    try {
      aiResponse = await fetch(`${ai.baseUrl}/chat/completions`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ai.apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          model: modelName,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            ...messages,
          ],
          max_tokens: 2000,
        }),
        signal: controller.signal,
      });
    } catch (fetchErr: unknown) {
      const isTimeout = (fetchErr as { name?: string })?.name === "AbortError";
      logAiUsage({
        user_id: user.id,
        action_type: "chat",
        model: modelName,
        request_duration_ms: Date.now() - aiStartTime,
        status: isTimeout ? "timeout" : "error",
        error_message: isTimeout ? "Timeout after 60s" : (fetchErr as Error)?.message,
      }).catch(() => {});
      throw new Error(isTimeout ? "A IA demorou demais. Tente novamente." : "Falha na conexão com a IA.");
    } finally {
      clearTimeout(timeoutId);
    }

    const aiDuration = Date.now() - aiStartTime;

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      logAiUsage({
        user_id: user.id,
        action_type: "chat",
        model: modelName,
        request_duration_ms: aiDuration,
        status: "error",
        error_message: `HTTP ${aiResponse.status}: ${errText.slice(0, 200)}`,
      }).catch(() => {});
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições excedido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(JSON.stringify({ error: "Erro ao conectar com a IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const aiData = await aiResponse.json();
    const reply: string = aiData.choices?.[0]?.message?.content || "";

    if (!reply) {
      return new Response(JSON.stringify({ error: "Resposta vazia da IA." }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    logAiUsage({
      user_id: user.id,
      action_type: "chat",
      model: modelName,
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
      request_duration_ms: aiDuration,
      status: "success",
    }).catch(() => {});

    // ── Persist updated messages ──────────────────────────────────────────
    const updatedMessages: ChatMessage[] = [
      ...messages,
      { role: "assistant", content: reply },
    ];

    await admin
      .from("chat_sessions")
      .update({ messages: updatedMessages })
      .eq("id", activeSessionId);

    return new Response(
      JSON.stringify({ reply, session_id: activeSessionId, ...(sessionTitle ? { title: sessionTitle } : {}) }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("chat error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
