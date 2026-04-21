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
- Mantenha equivalência avaliativa entre versões

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
PROVA:
- Mantenha o rigor avaliativo; adapte o FORMATO, não o CONTEÚDO conceitual
- Preserve o mesmo número de questões ou justifique a redução
- Garanta equivalência avaliativa entre versão universal e direcionada

EXERCÍCIO:
- Pode incluir scaffolding mais intenso (dicas, exemplos parciais)
- Pode adicionar questões preparatórias que construam o raciocínio gradualmente
- Permita maior flexibilidade no formato de resposta

ATIVIDADE DE CASA:
- Considere que o aluno não terá mediação do professor
- Inclua instruções mais detalhadas e autoexplicativas
- Sugira recursos de apoio (vídeos, materiais complementares)

TRABALHO:
- Divida em etapas com entregas parciais
- Forneça rubrica clara de avaliação
- Ofereça templates e organizadores para estruturar o trabalho

TAXONOMIA DE BLOOM — PRESERVAÇÃO
Identifique o nível cognitivo de cada questão e PRESERVE-O na adaptação:
- Lembrar → mantenha como lembrar
- Compreender → mantenha como compreender
- Aplicar → mantenha como aplicar
- Analisar → mantenha como analisar
- Avaliar → mantenha como avaliar
- Criar → mantenha como criar
A adaptação remove BARREIRAS DE ACESSO, não reduz o nível cognitivo.

REGRAS DE FORMATAÇÃO
1. FRAÇÕES: SEMPRE envolva expressões LaTeX com delimitadores de cifrão. Exemplos: $\\frac{a}{b}$, $\\sqrt{2}$
2. Notação escolar Unicode para variáveis: v₀, v², Δv
3. Preserve fórmulas, símbolos e unidades integralmente
4. NUNCA use asteriscos (**) ou nenhum marcador markdown no texto.
5. NUNCA escreva comandos LaTeX sem delimitadores $...$. Sempre use $...$

FORMATO DE RESPOSTA OBRIGATÓRIO
Responda EXATAMENTE com as 5 seções abaixo, separadas pelos marcadores ===.
ATENÇÃO: As seções ===VERSAO_UNIVERSAL=== e ===VERSAO_DIRECIONADA=== devem conter APENAS questões numeradas no formato DSL abaixo. Nenhum texto de prosa, passo a passo, parágrafo explicativo ou guia narrativo — apenas questões e apoios.

===VERSAO_UNIVERSAL===
> Instrução geral da atividade (opcional).

# Título da Seção

1) Enunciado da questão de múltipla escolha
a) Primeira alternativa
b*) Alternativa correta (marque com * na letra da correta)
c) Terceira alternativa
> Apoio: Dica de scaffolding.

2) Questão discursiva aberta
[linhas:4]
> Apoio: Passo a passo resumido.

3) Complete: O resultado de $\\frac{1}{2} + \\frac{1}{4}$ é ___.
[banco: 3/4, 1/2, 1/3]

4) Marque Verdadeiro ou Falso:
( ) O Sol é uma estrela.
( ) A Lua é um planeta.

===VERSAO_DIRECIONADA===
REGRA CRÍTICA: A versão direcionada DEVE ter os MESMOS números de questões que a universal (1, 2, 3, 4...) no MESMO formato DSL. A diferença está no conteúdo: enunciados mais simples, mais alternativas com scaffolding, apoios mais detalhados. NÃO escreva guias, passo a passo narrativo ou parágrafos de explicação — apenas questões DSL com > Apoio:.

> Instrução adaptada ao perfil identificado.

# Título da Seção

1) Enunciado simplificado da mesma questão 1
a) Primeira alternativa
b*) Alternativa correta
c) Terceira alternativa
> Apoio: Dica mais detalhada adaptada às barreiras.

2) Enunciado simplificado da mesma questão 2
[linhas:4]
> Apoio: Apoio passo a passo mais estruturado.

3) Complete: O resultado de $\\frac{1}{2} + \\frac{1}{4}$ é ___.
[banco: 3/4, 1/2, 1/3]
> Apoio: Dica contextualizada.

4) Marque Verdadeiro ou Falso:
( ) O Sol é uma estrela.
( ) A Lua é um planeta.
> Apoio: Pense em cada afirmação separadamente.

===ESTRATEGIAS===
- Estratégia pedagógica 1
- Estratégia pedagógica 2

===JUSTIFICATIVA===
Texto da justificativa pedagógica das adaptações realizadas.

===DICAS===
- Dica prática 1 para o professor implementar
- Dica prática 2`;
}

function parseDslResponse(content: string): Record<string, unknown> {
  type Marker = { key: string; marker: string };
  const markers: Marker[] = [
    { key: "version_universal", marker: "===VERSAO_UNIVERSAL===" },
    { key: "version_directed", marker: "===VERSAO_DIRECIONADA===" },
    { key: "strategies_raw", marker: "===ESTRATEGIAS===" },
    { key: "justification_raw", marker: "===JUSTIFICATIVA===" },
    { key: "tips_raw", marker: "===DICAS===" },
  ];

  const sections: Record<string, string> = {};
  for (let i = 0; i < markers.length; i++) {
    const start = content.indexOf(markers[i].marker);
    if (start === -1) {
      console.warn(`parseDslResponse: marcador '${markers[i].marker}' não encontrado`);
      continue;
    }
    const afterMarker = start + markers[i].marker.length;
    const nextMarkerIdx = markers[i + 1]
      ? content.indexOf(markers[i + 1].marker)
      : -1;
    sections[markers[i].key] = content
      .slice(afterMarker, nextMarkerIdx !== -1 ? nextMarkerIdx : undefined)
      .trim();
  }

  const parseList = (raw: string): string[] =>
    raw.split("\n").map((l) => l.replace(/^[-•*]\s*/, "").trim()).filter(Boolean);

  return {
    version_universal: sections.version_universal || "",
    version_directed: sections.version_directed || "",
    strategies_applied: parseList(sections.strategies_raw || ""),
    pedagogical_justification: sections.justification_raw || "",
    implementation_tips: parseList(sections.tips_raw || ""),
  };
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
    const { original_activity, activity_type, barriers, observation_notes } = body;

    if (!original_activity || !activity_type || !barriers || !Array.isArray(barriers) || barriers.length === 0) {
      return new Response(JSON.stringify({ error: "Campos obrigatórios ausentes: original_activity, activity_type, barriers." }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

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

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 90_000);
    const aiStartTime = Date.now();

    let aiResponse: Response;
    let aiData: unknown;
    let aiDurationMs: number;

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
        }),
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
        error_message: isTimeout
          ? "Request timed out after 90s"
          : ((fetchErr as Error)?.message || "Network error"),
        metadata: { activity_type: sanitizedType, barriers_count: barriers.length },
      }).catch(() => {});
      throw new Error(
        isTimeout
          ? "A IA demorou demais para responder. Tente novamente."
          : "Falha na conexão com a IA."
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
        metadata: { activity_type: sanitizedType, barriers_count: barriers.length, http_status: aiResponse.status },
      }).catch(() => {});

      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: "Limite de requisições IA atingido. Tente novamente em alguns minutos." }),
          { status: 429, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      return new Response(
        JSON.stringify({ error: "Falha na geração da adaptação." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    aiData = await aiResponse.json();
    const responseContent: string =
      (aiData as { choices?: Array<{ message?: { content?: string } }> })
        ?.choices?.[0]?.message?.content || "";
    const tokensUsed =
      (aiData as { usage?: { total_tokens?: number } })?.usage?.total_tokens ?? null;

    if (!responseContent) {
      return new Response(
        JSON.stringify({ error: "Resposta vazia da IA." }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    logAiUsage({
      user_id: user.id,
      action_type: "adaptation",
      model: modelName,
      input_tokens: (aiData as { usage?: { prompt_tokens?: number } })?.usage?.prompt_tokens || 0,
      output_tokens: (aiData as { usage?: { completion_tokens?: number } })?.usage?.completion_tokens || 0,
      request_duration_ms: aiDurationMs,
      status: "success",
      metadata: { activity_type: sanitizedType, barriers_count: barriers.length },
    }).catch(() => {});

    const adaptationResult = parseDslResponse(responseContent);

    const requiredFields = [
      "version_universal",
      "version_directed",
      "strategies_applied",
      "pedagogical_justification",
      "implementation_tips",
    ] as const;
    for (const field of requiredFields) {
      const value = adaptationResult[field];
      const isEmpty = !value || (Array.isArray(value) && value.length === 0);
      if (isEmpty) {
        return new Response(
          JSON.stringify({ error: `Resposta da IA incompleta: campo '${field}' ausente.` }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    return new Response(
      JSON.stringify({
        adaptation: adaptationResult,
        model_used: modelName,
        tokens_used: tokensUsed,
        disclaimer: "Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.",
      }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (e) {
    console.error("adapt-activity error:", e);
    return new Response(
      JSON.stringify({ error: e instanceof Error ? e.message : "Erro desconhecido" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
