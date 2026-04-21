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

const NEURODIVERGENCE_STRATEGIES: Record<string, string> = {
  tea: `TEA: Roteiros estruturados, linguagem objetiva, esquemas visuais passo a passo`,
  tdah: `TDAH: Etapas menores, marcadores de progresso, feedback frequente, uma instrução por vez`,
  dislexia: `Dislexia: Enunciados curtos e claros, palavras-chave destacadas, apoio visual`,
  discalculia: `Discalculia: Material concreto, exemplos resolvidos, representações visuais`,
  sindrome_down: `Síndrome de Down: Materiais visuais, linguagem simples, instruções passo a passo`,
  altas_habilidades: `Altas Habilidades: Desafios extras, maior complexidade, projetos investigativos`,
  tod: `TOD: Escolhas controladas, propósito claro, autonomia`,
  disgrafia: `Disgrafia: Alternativas à escrita, templates estruturados`,
  tourette: `Tourette: Pausas flexíveis, instruções segmentadas`,
  dispraxia: `Dispraxia: Reduzir escrita manual, alternativas orais/digitais`,
  toc: `TOC: Rubricas objetivas, estrutura previsível`,
};

function getStrategiesForBarriers(barriers: Array<{ dimension?: string }>): string {
  const profiles = new Set<string>();
  for (const b of barriers) {
    if (b.dimension && NEURODIVERGENCE_STRATEGIES[b.dimension]) {
      profiles.add(b.dimension);
    }
  }
  if (profiles.size === 0) return "";
  return Array.from(profiles)
    .map((p) => NEURODIVERGENCE_STRATEGIES[p])
    .join("\n");
}

function parseDslQuestionResponse(content: string): { question_dsl: string; changes_made: string[] } {
  const changesMarker = "===MUDANCAS===";
  const changesIdx = content.indexOf(changesMarker);
  const question_dsl = changesIdx !== -1
    ? content.slice(0, changesIdx).trim()
    : content.trim();
  const changesRaw = changesIdx !== -1
    ? content.slice(changesIdx + changesMarker.length).trim()
    : "";
  const changes_made = changesRaw
    .split("\n")
    .map((l) => l.replace(/^[-•*]\s*/, "").trim())
    .filter(Boolean);
  return { question_dsl, changes_made };
}

type StructuredQuestion = {
  number: number;
  type?: string;
  statement?: string;
  instruction?: string;
  alternatives?: Array<{ letter: string; text: string; correct?: boolean }>;
  word_bank?: string[];
  statements?: string[];
  line_count?: number;
  scaffolding?: string[];
};

function questionToDsl(q: StructuredQuestion): string {
  const num = q.number;
  const stmt = q.statement || "";
  const lines: string[] = [];
  if (q.instruction) lines.push(`> ${q.instruction}`);
  if (q.type === "multiple_choice" && Array.isArray(q.alternatives)) {
    lines.push(`${num}) ${stmt}`);
    for (const alt of q.alternatives) {
      const marker = alt.correct ? `${alt.letter}*` : alt.letter;
      lines.push(`${marker}) ${alt.text}`);
    }
  } else if (q.type === "fill_blank") {
    lines.push(`${num}) ${stmt}`);
    const words = Array.isArray(q.word_bank) ? q.word_bank.join(", ") : "";
    if (words) lines.push(`[banco: ${words}]`);
  } else if (q.type === "true_false") {
    lines.push(`${num}) ${stmt}`);
    if (Array.isArray(q.statements)) {
      for (const s of q.statements) lines.push(`( ) ${s}`);
    }
  } else {
    lines.push(`${num}) ${stmt}`);
    const lineCount = typeof q.line_count === "number" ? q.line_count : 3;
    lines.push(`[linhas:${lineCount}]`);
  }
  if (Array.isArray(q.scaffolding) && q.scaffolding.length > 0) {
    lines.push(`> Apoio: ${q.scaffolding.join(" ")}`);
  }
  return lines.join("\n");
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const ai = getAiConfig();

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Não autorizado." }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

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

    const body = await req.json();
    const { question, version_type, activity_type, barriers, hint } = body;

    if (!question || !version_type || !activity_type || !barriers || !Array.isArray(barriers)) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const sanitizedActivityType = sanitize(activity_type, 100);
    const sanitizedHint = hint ? sanitize(hint, 500) : "";

    const activeBarriersList = (barriers as Array<{ barrier_key?: string; dimension?: string; is_active?: boolean }>)
      .filter((b) => b.is_active !== false)
      .map((b) => b.barrier_key || b.dimension || "barreira")
      .join(", ");

    const strategies = getStrategiesForBarriers(barriers);
    const questionDslContext = questionToDsl(question as StructuredQuestion);
    const versionLabel = version_type === "universal"
      ? "VERSÃO UNIVERSAL (Design Universal para Aprendizagem)"
      : "VERSÃO DIRECIONADA (adaptada ao perfil específico)";

    const systemPrompt = `Você é ISA (Inteligência de Suporte à Aprendizagem), especialista em pedagogia inclusiva.

Você está REGENERANDO UMA ÚNICA QUESTÃO de uma atividade adaptada.

REGRAS:
1. MANTENHA o número da questão: ${question.number}
2. MANTENHA o tipo da questão a menos que claramente inadequado
3. PRESERVE o nível cognitivo (Taxonomia de Bloom)
4. PRESERVE o conteúdo/objetivo pedagógico
5. MELHORE clareza, scaffolding e adequação às barreiras
6. Para VERSÃO UNIVERSAL: aplique princípios DUA para todos os alunos
7. Para VERSÃO DIRECIONADA: personalize fortemente para o perfil identificado

${strategies ? `ESTRATÉGIAS PARA O PERFIL:\n${strategies}` : ""}

REGRAS DE FORMATAÇÃO:
- FRAÇÕES: use $\\frac{a}{b}$ (dentro de $...$)
- Notação escolar: v₀, v², Δv
- NUNCA use asteriscos (**) ou markdown no texto

FORMATO DE RESPOSTA OBRIGATÓRIO:
Retorne APENAS a questão no formato DSL abaixo, seguida do marcador ===MUDANCAS=== com a lista de mudanças.

Exemplos de formato DSL por tipo:

Múltipla escolha:
${question.number}) Enunciado da questão
a) Alternativa A
b*) Alternativa correta (asterisco na letra correta)
c) Alternativa C
> Apoio: Dica de scaffolding.

Discursiva:
${question.number}) Enunciado da questão discursiva
[linhas:4]
> Apoio: Passo a passo de apoio.

Lacuna:
${question.number}) Complete: O resultado de $\\frac{1}{2} + \\frac{1}{4}$ é ___.
[banco: 3/4, 1/2, 1/3]

Verdadeiro/Falso:
${question.number}) Marque Verdadeiro ou Falso:
( ) Afirmação 1.
( ) Afirmação 2.

===MUDANCAS===
- Mudança realizada 1
- Mudança realizada 2`;

    const userPrompt = `REGENERAR QUESTÃO ${question.number} — ${versionLabel}

TIPO DE ATIVIDADE: ${sanitizedActivityType}
BARREIRAS: ${activeBarriersList}

QUESTÃO ATUAL (formato DSL):
${questionDslContext}
${sanitizedHint ? `\nSUGESTÃO DO PROFESSOR: ${sanitizedHint}` : ""}

Regenere esta questão melhorando clareza, scaffolding e adequação às barreiras. Mantenha o conteúdo e nível cognitivo.`;

    const modelName = ai.resolveModel("google/gemini-2.5-flash");
    const aiStartTime = Date.now();
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 60_000);

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
            { role: "system", content: systemPrompt },
            { role: "user", content: userPrompt },
          ],
          max_tokens: 2000,
          temperature: 0.7,
        }),
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeoutId);
    }

    const aiDuration = Date.now() - aiStartTime;

    if (!aiResponse.ok) {
      const errText = await aiResponse.text();
      console.error("AI error:", aiResponse.status, errText);
      logAiUsage({
        user_id: user.id,
        action_type: "regenerate-question",
        model: modelName,
        input_tokens: 0,
        output_tokens: 0,
        request_duration_ms: aiDuration,
        status: "error",
        error_message: `HTTP ${aiResponse.status}: ${errText.slice(0, 200)}`,
        metadata: { activity_type: sanitizedActivityType, question_number: question.number },
      }).catch(() => {});
      return new Response(
        JSON.stringify({ error: "Erro na IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const aiData = await aiResponse.json();
    const responseContent: string = aiData.choices?.[0]?.message?.content || "";

    logAiUsage({
      user_id: user.id,
      action_type: "regenerate-question",
      model: modelName,
      input_tokens: aiData.usage?.prompt_tokens || 0,
      output_tokens: aiData.usage?.completion_tokens || 0,
      request_duration_ms: aiDuration,
      status: "success",
      metadata: { activity_type: sanitizedActivityType, question_number: question.number },
    }).catch(() => {});

    if (!responseContent) {
      return new Response(
        JSON.stringify({ error: "Resposta vazia da IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const { question_dsl, changes_made } = parseDslQuestionResponse(responseContent);

    if (!question_dsl) {
      return new Response(
        JSON.stringify({ error: "Resposta da IA em formato inesperado." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ question_dsl, changes_made }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("regenerate-question error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro interno." }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
