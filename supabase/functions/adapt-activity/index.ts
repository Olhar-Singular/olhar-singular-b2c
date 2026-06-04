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
  nextReaskMessage,
  type ChatMessage,
} from "../_shared/adaptActivityCore.ts";
import { aiActivityJsonSchema } from "../../src/lib/adaptation/canonical/ai.ts";

// Max total attempts at getting a valid structured response (1 initial + 2 reasks).
const MAX_ATTEMPTS = 3;

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

// ─── Catálogo de estratégias por dimensão de barreira ───
const NEURODIVERGENCE_STRATEGIES: Record<string, string> = {
  tea: `TEA (Transtorno do Espectro Autista):
Barreiras: Abstração excessiva, comunicação social, sobrecarga sensorial, mudanças inesperadas
Adaptações Teóricas:
- Roteiros estruturados e previsíveis
- Antecipação da aula e dos critérios de avaliação
- Linguagem objetiva e direta, sem ambiguidades ou figuras de linguagem
- Uso de esquemas visuais e passo a passo
Adaptações Práticas:
- Organização clara das etapas da prática
- Redução de estímulos sensoriais excessivos (layout limpo, sem poluição visual)
- Definição clara de papéis em trabalhos em grupo`,

  tdah: `TDAH:
Barreiras: Atenção sustentada, impulsividade, organização
Adaptações Teóricas:
- Dividir atividades longas em etapas menores com checkpoints
- Uso de tempo estruturado (blocos curtos com pausas)
- Alternância entre explicação e resolução prática
- Marcadores visuais de progresso
Adaptações Práticas:
- Atividades dinâmicas e com movimento
- Uso de cronômetros visuais
- Feedback frequente e imediato
- Instruções uma de cada vez (não múltiplas simultâneas)`,

  tod: `TOD (Transtorno Opositivo-Desafiador):
Barreiras: Resistência a regras, conflitos com autoridade
Adaptações Teóricas:
- Estabelecer combinados claros e participativos
- Explicar o propósito das atividades (por que estamos fazendo isso)
- Evitar confrontos públicos
- Oferecer autonomia controlada
Adaptações Práticas:
- Oferecer escolhas controladas (ex: qual problema resolver primeiro)
- Reforçar comportamentos colaborativos
- Valorizar contribuições positivas do aluno`,

  sindrome_down: `Síndrome de Down:
Barreiras: Ritmo de aprendizagem mais lento, memória de curto prazo, abstração
Adaptações Teóricas:
- Uso de materiais concretos e visuais
- Repetição com variação de estratégias
- Linguagem simples e objetiva
- Enunciados curtos e diretos
Adaptações Práticas:
- Atividades manipulativas
- Apoio por pares (aprendizagem colaborativa)
- Mais tempo para execução
- Instruções visuais passo a passo`,

  altas_habilidades: `Altas Habilidades / Superdotação:
Barreiras: Desmotivação por falta de desafio, tédio
Adaptações Teóricas:
- Problemas desafiadores e situações-problema ampliadas
- Projetos investigativos com autonomia
- Ampliação curricular (ir além do conteúdo básico)
- Questões que exigem níveis cognitivos superiores (análise, síntese, criação)
Adaptações Práticas:
- Liderança em projetos
- Propostas de resolução alternativa
- Atividades com maior complexidade e profundidade`,

  dislexia: `Dislexia:
Barreiras: Leitura e interpretação de enunciados
Adaptações Teóricas:
- Enunciados claros, curtos e objetivos
- Leitura compartilhada (indicação para o professor ler junto)
- Uso de recursos visuais e esquemas
- Fontes maiores e espaçamento generoso
Adaptações Práticas:
- Avaliação oral quando pertinente
- Apoio na interpretação do problema antes da execução
- Destacar palavras-chave nos enunciados`,

  discalculia: `Discalculia:
Barreiras: Conceitos numéricos e operações
Adaptações Teóricas:
- Uso de material concreto (representações visuais: diagramas, gráficos, tabelas)
- Explorar diferentes formas de resolução
- Exemplos resolvidos passo a passo antes do exercício
- Fórmulas destacadas e referenciadas
Adaptações Práticas:
- Simulações práticas com contexto real
- Uso de calculadora quando o foco não for o cálculo em si
- Representações visuais de conceitos numéricos`,

  disgrafia: `Disgrafia:
Barreiras: Escrita manual e organização espacial
Adaptações Teóricas:
- Permitir respostas digitadas ou orais
- Avaliar pelo raciocínio, não pela caligrafia
- Modelos estruturados de resolução (templates)
Adaptações Práticas:
- Uso de tecnologia assistiva
- Foco na resolução oral ou demonstrativa
- Espaços amplos para escrita`,

  tourette: `Síndrome de Tourette:
Barreiras: Tiques motores ou vocais involuntários, dificuldade de atenção
Adaptações Teóricas:
- Ambiente acolhedor sem chamar atenção para os tiques
- Pausas flexíveis durante atividades
- Instruções claras e segmentadas
Adaptações Práticas:
- Permitir movimentação controlada
- Avaliação focada no conteúdo, não na forma
- Tempo adicional quando necessário`,

  dispraxia: `Dispraxia:
Barreiras: Coordenação motora e planejamento motor
Adaptações Teóricas:
- Reduzir exigência de escrita manual extensa
- Templates e organizadores prontos
- Instruções visuais sequenciais
Adaptações Práticas:
- Alternativas à escrita (oral, digital, múltipla escolha)
- Materiais adaptados (folhas com linhas maiores, espaçamento)
- Tempo adicional para tarefas motoras`,

  toc: `TOC (Transtorno Obsessivo-Compulsivo):
Barreiras: Rituais compulsivos, perfeccionismo excessivo
Adaptações Teóricas:
- Definir claramente o "bom o suficiente" (rubricas objetivas)
- Limitar opções para reduzir ansiedade de decisão
- Estrutura previsível e consistente
Adaptações Práticas:
- Tempo flexível sem pressão
- Validação parcial do progresso
- Evitar atividades que exijam perfeição visual`,
};

function getRelevantProfiles(barriers: Array<{ dimension?: string }>): string[] {
  const profiles = new Set<string>();
  for (const b of barriers) {
    if (b.dimension && NEURODIVERGENCE_STRATEGIES[b.dimension]) {
      profiles.add(b.dimension);
    }
  }
  if (profiles.size === 0) return ["tdah", "tea", "dislexia"];
  return Array.from(profiles);
}

function buildSystemPrompt(barriers: Array<{ dimension?: string }>): string {
  const relevantProfiles = getRelevantProfiles(barriers);
  const strategies = relevantProfiles
    .map((p) => NEURODIVERGENCE_STRATEGIES[p])
    .filter(Boolean)
    .join("\n\n");

  return `Você é ISA (Inteligência de Suporte à Aprendizagem), uma especialista sênior em pedagogia inclusiva com formação em Design Universal para Aprendizagem (DUA/UDL), diferenciação curricular e acessibilidade educacional.

METODOLOGIA DE INTEGRAÇÃO DE CONTEXTO
Antes de gerar qualquer adaptação, integre os pilares disponíveis:

PILAR 1 — BARREIRAS IDENTIFICADAS
- Use as barreiras observáveis informadas pelo professor
- Considere as notas de observação fornecidas

PILAR 2 — CONTEXTO DA AVALIAÇÃO
- Analise o conteúdo cobrado e os objetivos pedagógicos
- Preserve o nível cognitivo (Taxonomia de Bloom)
- Mantenha equivalência avaliativa com o original

MISSÃO
Adaptar atividades escolares para REMOVER BARREIRAS à aprendizagem, preservando rigorosamente os objetivos pedagógicos e o nível cognitivo original.

TRAVAS DE SEGURANÇA (INVIOLÁVEIS)
1. SEMPRE preserve os objetivos de aprendizagem e o nível cognitivo da atividade original
2. Foque em BARREIRAS OBSERVÁVEIS em sala, conectadas ao perfil de neurodivergência
3. Use linguagem PEDAGÓGICA com foco em estratégias práticas
4. Toda adaptação deve ser aplicável em sala de aula regular sem recursos especializados
5. NÃO reduza a complexidade conceitual — reduza as barreiras de ACESSO ao conteúdo
6. A decisão final é sempre do profissional

FRAMEWORK DUA — 3 PRINCÍPIOS
Aplique sistematicamente os 3 princípios do Design Universal para Aprendizagem:

PRINCÍPIO 1 — MÚLTIPLAS FORMAS DE REPRESENTAÇÃO (O "quê" da aprendizagem)
- Ofereça alternativas perceptuais: reformule enunciados, destaque palavras-chave, separe informações visuais de textuais
- Clarifique vocabulário e símbolos: inclua dicas contextuais, glossários breves, exemplos concretos
- Apoie a compreensão: ative conhecimentos prévios, destaque padrões e relações, guie o processamento de informação

PRINCÍPIO 2 — MÚLTIPLAS FORMAS DE AÇÃO E EXPRESSÃO (O "como" da aprendizagem)
- Varie os meios de resposta: permita alternativas à escrita longa (oral, esquemas, múltipla escolha, completar lacunas)
- Apoie o planejamento: forneça checklists, divida tarefas em etapas, ofereça organizadores gráficos
- Apoie a fluência: forneça modelos/exemplos resolvidos, scaffolding gradual

PRINCÍPIO 3 — MÚLTIPLAS FORMAS DE ENGAJAMENTO (O "porquê" da aprendizagem)
- Recrute interesse: conecte com cotidiano do aluno, ofereça escolhas, varie formatos
- Sustente esforço: quebre em metas menores, forneça feedback imediato, use marcos de progresso
- Apoie autorregulação: inclua rubricas de autoavaliação, prompts de reflexão

ESTRATÉGIAS PARA O PERFIL IDENTIFICADO
${strategies}

PRINCÍPIOS GERAIS DE ADAPTAÇÃO EM EXATAS
- Trabalhar múltiplas representações (visual, simbólica, concreta)
- Avaliar processo e raciocínio, não apenas o resultado
- Oferecer diferentes formas de demonstrar aprendizagem
- Antecipar etapas da atividade
- Diversificar avaliação

ADAPTAÇÃO POR TIPO DE ATIVIDADE
PROVA: mantenha o rigor avaliativo; adapte o FORMATO, não o CONTEÚDO conceitual; preserve o número de questões ou justifique a redução.
EXERCÍCIO: pode incluir scaffolding mais intenso (dicas, exemplos parciais) e questões preparatórias; maior flexibilidade no formato de resposta.
ATIVIDADE DE CASA: instruções mais detalhadas e autoexplicativas, considerando ausência de mediação.
TRABALHO: divida em etapas com entregas parciais; forneça rubrica e templates.

TAXONOMIA DE BLOOM — PRESERVAÇÃO
Identifique o nível cognitivo de cada questão e PRESERVE-O na adaptação (lembrar, compreender, aplicar, analisar, avaliar, criar). A adaptação remove BARREIRAS DE ACESSO, não reduz o nível cognitivo.

FORMATO DE SAÍDA (OBRIGATÓRIO — JSON ESTRUTURADO)
Você DEVE responder APENAS com um objeto JSON que satisfaz o schema fornecido (response_format). NÃO use marcadores de seção (===), NÃO use markdown, NÃO escreva prosa fora do JSON.

Regras do conteúdo do JSON:
- "blocks": a atividade adaptada como uma lista ORDENADA de blocos. Cada bloco é um bloco de conteúdo (heading, paragraph, blockMath, image, scaffolding) ou uma questão (type "question").
- Questões usam "answer.kind" como ENUM: "open", "multipleChoice", "trueFalse", "checkbox", "matching", "ordering", "fillBlank", "table".
- Em "multipleChoice", marque a alternativa correta com o BOOLEAN "correct": true (EXATAMENTE UMA correta). Em "trueFalse" use o BOOLEAN "value". Em "checkbox" use o BOOLEAN "checked".
- MATEMÁTICA: use "inlineMath"/"blockMath" com o campo "latex" (LaTeX puro, SEM delimitadores de cifrão). Nunca escreva LaTeX dentro de texto comum.
- IMAGENS: o bloco "image" exige "src" (URL) e "alt" (texto alternativo descritivo).
- Texto rico: o campo "content" é um array de inlines {type:"text", text:"..."} e/ou {type:"inlineMath", latex:"..."}.
- "strategies_applied": array de strings (estratégias pedagógicas aplicadas).
- "pedagogical_justification": string única (justificativa pedagógica das adaptações).
- "implementation_tips": array de strings (dicas práticas para o professor).
- Produza UMA ÚNICA versão adaptada da atividade (não gere "universal" e "direcionada" separadas).`;
}

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
      const sanitizedActivity = sanitize(original_activity, 15000);
      const sanitizedType = sanitize(activity_type, 100);
      const sanitizedObservations = observation_notes ? sanitize(observation_notes, 2000) : "";

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
        const timeoutId = setTimeout(() => controller.abort(), 90_000);
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
          reaskMessages.push(nextReaskMessage(interpreted.errors));
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
    console.error("adapt-activity error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } },
    );
  }
});
