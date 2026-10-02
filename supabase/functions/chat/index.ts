import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "@supabase/supabase-js";
import { logAiUsage } from "../_shared/logAiUsage.ts";
import { getAiConfig } from "../_shared/aiConfig.ts";
import { chargeCredits, type CreditRpcResult } from "../_shared/credits.ts";
import {
  admitTurn,
  buildAiContext,
  parseUserTurn,
  sessionTitle,
  TURN_IN_FLIGHT_MESSAGE,
  type ChatMessage,
} from "../_shared/chatTurn.ts";
import { errorResponse } from "../_shared/publicError.ts";

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

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Não autorizado." }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user }, error: authError } = await userClient.auth.getUser();
    if (authError || !user) {
      return json({ error: "Não autorizado." }, 401);
    }

    const admin = createClient(supabaseUrl, supabaseServiceKey);

    const body = await req.json();
    const { messages, session_id } = body as {
      messages?: unknown;
      session_id?: string;
    };

    // Only the LAST element of `messages` is read, as the new user turn; the
    // rest of what the client sends is ignored. Validated before any charge.
    const parsed = parseUserTurn(messages);
    if (!parsed.ok) {
      return json({ error: parsed.error }, 400);
    }
    const turn = parsed.turn;

    let activeSessionId: string;
    let title: string | undefined;
    // The stored transcript before this turn: the AI context is built on it,
    // it is what gets persisted, and a failed turn puts it back.
    let history: ChatMessage[] = [];

    if (!session_id) {
      // ── New session flow ─────────────────────────────────────────────────
      const { count, error: countError } = await admin
        .from("chat_sessions")
        .select("id", { count: "exact", head: true })
        .eq("user_id", user.id);

      if (countError) {
        console.error("count sessions error:", countError);
        return json({ error: "Erro interno." }, 500);
      }

      if ((count ?? 0) >= MAX_SESSIONS) {
        return json(
          {
            error: `Limite de ${MAX_SESSIONS} conversas atingido. Exclua uma conversa antiga para iniciar uma nova.`,
          },
          429,
        );
      }

      // Deduct 3 credits for the new session (plan bucket first, then extras;
      // courtesy accounts come back as "exempt" and proceed). The charge decision
      // lives in the shared, unit-tested chargeCredits; chat keeps its own copy.
      const charge = await chargeCredits({
        cost: SESSION_CREDIT_COST,
        claimFree: () => Promise.resolve(false),
        deduct: async () => {
          const { data, error } = await admin.rpc("deduct_credits", {
            p_user_id: user.id,
            p_amount: SESSION_CREDIT_COST,
            p_type: "chat",
          });
          return { data: data as CreditRpcResult | null, error };
        },
      });

      if (charge.status === "insufficient") {
        return json({ error: "Créditos insuficientes.", balance: charge.balance ?? 0 }, 402);
      }
      if (charge.status === "error") {
        if (charge.reason === "rpc") console.error("deduct_credits error:", charge.cause);
        return json(
          {
            error: charge.reason === "rpc"
              ? "Erro ao verificar créditos."
              : "Erro interno ao processar créditos.",
          },
          500,
        );
      }

      title = sessionTitle(turn);

      // The row is born holding the turn, like a claimed one (see below).
      const { data: newSession, error: insertError } = await admin
        .from("chat_sessions")
        .insert({ user_id: user.id, title, messages: [turn] })
        .select("id")
        .single();

      if (insertError || !newSession) {
        console.error("insert session error:", insertError);
        return json({ error: "Erro ao criar sessão." }, 500);
      }

      activeSessionId = newSession.id;
    } else {
      // ── Existing session flow ─────────────────────────────────────────────
      // Read through the user's client: RLS is what proves the session is theirs.
      const { data: existing, error: sessionError } = await userClient
        .from("chat_sessions")
        .select("id, messages, updated_at")
        .eq("id", session_id)
        .single();

      if (sessionError || !existing) {
        return json({ error: "Sessão não encontrada ou sem permissão." }, 403);
      }

      // Exchange limit and "a turn is still in flight" come from the STORED
      // transcript, never from the client's copy.
      const admission = admitTurn(
        { messages: existing.messages, updatedAt: existing.updated_at },
        Date.now(),
      );
      if (!admission.ok) {
        return json({ error: admission.error }, admission.status);
      }
      history = admission.history;

      // Claim the turn BEFORE paying for the AI. The write only lands while the
      // row is still the one just read (the BEFORE UPDATE trigger bumps
      // updated_at on every write), so of two concurrent requests only one gets
      // through, and every later one sees the pending turn and is refused.
      const { data: claimed, error: claimError } = await admin
        .from("chat_sessions")
        .update({ messages: [...history, turn] })
        .eq("id", session_id)
        .eq("updated_at", existing.updated_at)
        .select("id")
        .maybeSingle();

      if (claimError) {
        console.error("claim turn error:", claimError, "session:", session_id);
        return json({ error: "Erro interno." }, 500);
      }
      if (!claimed) {
        return json({ error: TURN_IN_FLIGHT_MESSAGE }, 409);
      }

      activeSessionId = session_id;
    }

    // A turn that gets no reply is taken back, so the session neither keeps it
    // unanswered nor stays blocked until the in-flight window runs out.
    const releaseTurn = async () => {
      const { error } = await admin
        .from("chat_sessions")
        .update({ messages: history })
        .eq("id", activeSessionId);
      if (error) console.error("release turn error:", error, "session:", activeSessionId);
    };
    const failTurn = async (status: number, message: string) => {
      await releaseTurn();
      return json({ error: message }, status);
    };

    try {
      // ── Call Gemini Flash ───────────────────────────────────────────────
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
              ...buildAiContext(history, turn),
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
        return await failTurn(
          isTimeout ? 504 : 502,
          isTimeout ? "A IA demorou demais. Tente novamente." : "Falha na conexão com a IA.",
        );
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
          return await failTurn(429, "Limite de requisições excedido. Tente novamente em alguns minutos.");
        }
        return await failTurn(500, "Erro ao conectar com a IA.");
      }

      const aiData = await aiResponse.json();
      const reply: string = aiData.choices?.[0]?.message?.content || "";

      if (!reply) {
        return await failTurn(500, "Resposta vazia da IA.");
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

      // ── Persist: stored history + this exchange (never the client's copy) ──
      const { error: persistError } = await admin
        .from("chat_sessions")
        .update({ messages: [...history, turn, { role: "assistant", content: reply }] })
        .eq("id", activeSessionId);
      if (persistError) {
        // The reply is still delivered; the pending turn expires on its own.
        console.error("persist messages error:", persistError, "session:", activeSessionId);
      }

      return json({ reply, session_id: activeSessionId, ...(title ? { title } : {}) });
    } catch (inner) {
      // Backstop: an unexpected failure after the claim must not leave the turn behind.
      await releaseTurn();
      throw inner;
    }
  } catch (e) {
    return errorResponse(e, { label: "chat error:", headers: corsHeaders });
  }
});
