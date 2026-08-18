// =============================================================================
// Adaptation prompt logic — the neurodivergence strategy catalogue plus the
// system-prompt builder used by the `adapt-activity` edge function.
//
// This lives in `_shared/` (pure, no URL imports) so it is covered by Vitest,
// per CLAUDE.md: real logic must not sit in the coverage-excluded index.ts glue.
// =============================================================================

// ─── Input sanitisation caps (chars) used by the edge function ───
export const MAX_ACTIVITY_CHARS = 15000;
export const MAX_ACTIVITY_TYPE_CHARS = 100;
export const MAX_OBSERVATION_CHARS = 2000;

// ─── AI request timeouts (ms) ───

/** Budget for the first call. */
export const AI_REQUEST_TIMEOUT_MS = 90_000;

/**
 * Budget for a reask. A reask replays the whole rejected document plus the
 * error list, so it generates materially more than the first call did — 28s
 * → 64s on the same activity, measured in production. Holding it to the base
 * timeout is what turned a recoverable validation failure into a 502.
 */
export const AI_REASK_TIMEOUT_MS = 120_000;

/**
 * Ceiling across ALL attempts of one request, so a slow chain can never run
 * into the Supabase edge-function wall-clock limit (400s) — where the isolate
 * is killed outright and the credit reservation is left for the reconciliation
 * job instead of being reversed inline.
 */
export const AI_TOTAL_BUDGET_MS = 240_000;

/**
 * Below this, an attempt cannot plausibly finish — the fastest generation ever
 * logged took ~23s. Firing one anyway would trade the validation errors we can
 * actually report for an opaque "a IA demorou demais", after a longer wait.
 */
const MIN_ATTEMPT_MS = 30_000;

/**
 * Timeout to give attempt `attempt` after `elapsedMs` already spent on this
 * request. Returns 0 when the remaining budget is too small to be worth a
 * call — the caller must then stop retrying and report the validation errors.
 */
export function attemptTimeoutMs(attempt: number, elapsedMs: number): number {
  const cap = attempt === 1 ? AI_REQUEST_TIMEOUT_MS : AI_REASK_TIMEOUT_MS;
  const remaining = AI_TOTAL_BUDGET_MS - elapsedMs;
  if (remaining < MIN_ATTEMPT_MS) return 0;
  return Math.min(cap, remaining);
}

// Fallback neurodivergence profiles used when no barrier maps to a known
// strategy, so the prompt always carries concrete guidance.
export const DEFAULT_PROFILES = ["tdah", "tea", "dislexia"] as const;

// ─── Catálogo de estratégias por dimensão de barreira ───
export const NEURODIVERGENCE_STRATEGIES: Record<string, string> = {
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

/**
 * Resolve the set of strategy profiles relevant to the reported barriers.
 * Falls back to a default trio when no barrier dimension maps to a known
 * strategy, so the prompt always carries concrete guidance.
 */
export function getRelevantProfiles(barriers: Array<{ dimension?: string }>): string[] {
  const profiles = new Set<string>();
  for (const b of barriers) {
    if (b.dimension && NEURODIVERGENCE_STRATEGIES[b.dimension]) {
      profiles.add(b.dimension);
    }
  }
  if (profiles.size === 0) return [...DEFAULT_PROFILES];
  return Array.from(profiles);
}

/**
 * A single adapted question, embedded verbatim in the system prompt as a
 * worked example.
 *
 * The prompt was 100% declarative before this: nine DUA bullets and a schema,
 * with nothing showing what "good" looks like. One concrete pair does more to
 * fix the shape of the output than another paragraph of instruction.
 *
 * Kept as a value (not a string) so the test suite can parse it against the
 * real `AiBlockSchema` — an example that drifts out of sync with the schema
 * would be teaching the model to emit exactly what the validator rejects.
 */
export const SCAFFOLDING_EXAMPLE_QUESTION = {
  type: "question",
  stem: [
    {
      type: "paragraph",
      content: [
        {
          type: "text",
          text: "Uma padaria vendeu 24 pães pela manhã e 18 pães à tarde. Quantos pães ela vendeu no dia todo?",
        },
      ],
    },
    {
      type: "scaffolding",
      items: [
        "Sublinhe no enunciado os dois números que aparecem.",
        "Decida a operação: juntar quantidades pede adição.",
        "Efetue a soma e escreva o resultado com a unidade (pães).",
      ],
    },
  ],
  answer: { kind: "open", answerLines: 3 },
} as const;

/** One selected barrier, as the client sends it in the request body. */
export interface PromptBarrier {
  dimension?: string;
  barrier_key?: string;
  /**
   * The human-readable barrier name ("Dificuldade na leitura e interpretação
   * de enunciados"). Optional because older persisted payloads predate it —
   * those still fall back to the key.
   */
  label?: string;
  notes?: string;
}

export interface BuildUserPromptInput {
  /** Already sanitised by the caller (see MAX_* caps above). */
  activityType: string;
  barriers: PromptBarrier[];
  /** Already sanitised; empty string means "the teacher wrote nothing". */
  observations: string;
  /** Already sanitised. */
  activity: string;
}

/**
 * The user-turn prompt: what the model is asked to adapt, and for whom.
 *
 * Names each barrier by its LABEL when available. Sending only the key made
 * the model read `dislexia_leitura` where the teacher had picked "Dificuldade
 * na leitura e interpretação de enunciados" — the key is an internal
 * identifier, and asking a model to infer pedagogy from a snake_case token
 * throws away the one sentence that actually describes the student's barrier.
 */
export function buildUserPrompt({
  activityType,
  barriers,
  observations,
  activity,
}: BuildUserPromptInput): string {
  const barriersList = barriers
    .map((b) => {
      const parts = [b.label || b.barrier_key || b.dimension || "barreira"];
      if (b.dimension) parts.push(`(dimensão: ${b.dimension})`);
      if (b.notes) parts.push(`— nota: ${b.notes}`);
      return parts.join(" ");
    })
    .join("\n- ");

  let prompt = `TIPO DE ATIVIDADE: ${activityType}

BARREIRAS OBSERVÁVEIS:
- ${barriersList}`;

  if (observations) {
    prompt += `\n\nOBSERVAÇÕES DO PROFESSOR:\n${observations}`;
  }

  prompt += `\n\nATIVIDADE ORIGINAL:\n${activity}`;
  return prompt;
}

export interface BuildSystemPromptOptions {
  /**
   * Upload-direto-de-prova flow only: the activity text was extracted
   * automatically from a real uploaded exam (not hand-picked bank questions),
   * so question/image order must be preserved exactly and text should change
   * only where the barrier genuinely requires it.
   */
  fidelityMode?: boolean;
}

export function buildSystemPrompt(
  barriers: Array<{ dimension?: string }>,
  options: BuildSystemPromptOptions = {},
): string {
  const relevantProfiles = getRelevantProfiles(barriers);
  const strategies = relevantProfiles
    .map((p) => NEURODIVERGENCE_STRATEGIES[p])
    .filter(Boolean)
    .join("\n\n");

  const fidelityBlock = options.fidelityMode
    ? `

MODO FIEL (upload direto de prova)
Esta atividade foi extraída automaticamente de uma prova real enviada pelo professor (upload direto do arquivo, não escolha manual de questões). Regras adicionais, inegociáveis:
- Preserve a ORDEM ORIGINAL das questões e das imagens EXATAMENTE como aparecem na entrada — não reordene, não remova nem invente questões além do que já foi filtrado antes de chegar até você.
- Só modifique o TEXTO de uma questão quando a adaptação para as barreiras selecionadas EXIGIR (ex.: simplificar vocabulário ambíguo, reformular um enunciado confuso para a barreira em questão). Quando a barreira não exigir mudança no texto, preserve a redação original o mais próximo possível — não reescreva por reescrever.
- ADICIONE textos de apoio (scaffolding, dicas, exemplos resolvidos) conforme a seção TEXTOS DE APOIO acima. Preservar a prova NÃO dispensa o apoio: ele se SOMA ao conteúdo original, sem remover nem substituir nada. Fidelidade se aplica ao que já estava lá, não ao que precisa ser acrescentado.`
    : "";

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
PROVA: mantenha o rigor avaliativo; adapte o FORMATO, não o CONTEÚDO conceitual; preserve o número de questões ou justifique a redução. Textos de apoio SÃO esperados também aqui — apoio de PROCESSO (o que fazer) não entrega a resposta nem rebaixa o nível de Bloom.
EXERCÍCIO: pode incluir scaffolding mais intenso (dicas, exemplos parciais) e questões preparatórias; maior flexibilidade no formato de resposta.
ATIVIDADE DE CASA: instruções mais detalhadas e autoexplicativas, considerando ausência de mediação.
TRABALHO: divida em etapas com entregas parciais; forneça rubrica e templates.

TAXONOMIA DE BLOOM — PRESERVAÇÃO
Identifique o nível cognitivo de cada questão e PRESERVE-O na adaptação (lembrar, compreender, aplicar, analisar, avaliar, criar). A adaptação remove BARREIRAS DE ACESSO, não reduz o nível cognitivo.

TEXTOS DE APOIO (SCAFFOLDING) — OBRIGATÓRIO
O apoio passo a passo é a adaptação que mais remove barreira de ACESSO sem tocar no nível cognitivo, e é o que o professor mais espera encontrar na atividade adaptada. NÃO é opcional:
- Para CADA questão que exija leitura de enunciado longo, interpretação, ou mais de uma etapa de raciocínio, inclua um bloco "scaffolding" DENTRO do "stem", logo após o enunciado.
- De 2 a 4 itens curtos, no imperativo, dizendo O QUE FAZER — nunca a resposta. "Sublinhe o que a questão pede" é apoio; "o resultado é 42" é gabarito e está PROIBIDO.
- Numa atividade com mais de duas questões, ao menos uma DEVE trazer apoio.
- O apoio SOMA-SE ao conteúdo original: não encurte nem substitua o enunciado para abrir espaço para ele.

EXEMPLO DE QUESTÃO COM APOIO (ilustra o nível de detalhe esperado — NÃO copie este conteúdo, adapte o da atividade real):
${JSON.stringify(SCAFFOLDING_EXAMPLE_QUESTION)}
${fidelityBlock}

FORMATO DE SAÍDA (OBRIGATÓRIO — JSON ESTRUTURADO)
Você DEVE responder APENAS com um objeto JSON que satisfaz o schema fornecido (response_format). NÃO use marcadores de seção (===), NÃO use markdown, NÃO escreva prosa fora do JSON.

Regras do conteúdo do JSON:
- "blocks": a atividade adaptada como uma lista ORDENADA de blocos. Cada bloco é um bloco de conteúdo (heading, paragraph, blockMath, image, scaffolding) ou uma questão (type "question").
- DOIS VOCABULÁRIOS SEPARADOS — NÃO OS MISTURE. O campo "type" (de um bloco) e o campo "answer.kind" (de uma questão) têm listas DIFERENTES e um nome NUNCA vale para os dois:
  · "type" de bloco aceita SOMENTE: "heading", "paragraph", "blockMath", "image", "scaffolding", "question". NÃO existem outros tipos de bloco. Em particular, "table" NÃO é um tipo de bloco: para uma tabela, use uma questão com "answer.kind": "table" (campo "rows"); se a tabela for apenas informativa, descreva-a em parágrafos. Isso vale também dentro do "stem" de uma questão.
  · "answer.kind" aceita SOMENTE: "open", "multipleChoice", "trueFalse", "checkbox", "matching", "ordering", "fillBlank", "table". NUNCA use um nome de bloco como "answer.kind" — "scaffolding", "paragraph" e "heading" são INVÁLIDOS aí. Para dar apoio passo a passo dentro de uma questão, coloque um bloco "scaffolding" no "stem" e use "answer.kind": "open".
- Em "multipleChoice", marque a alternativa correta com o BOOLEAN "correct": true (EXATAMENTE UMA correta). Em "trueFalse" use o BOOLEAN "value". Em "checkbox" use o BOOLEAN "checked".
- MATEMÁTICA: use "inlineMath"/"blockMath" com o campo "latex" (LaTeX puro, SEM delimitadores de cifrão). Nunca escreva LaTeX dentro de texto comum.
- IMAGENS — REGRA CRÍTICA: NUNCA invente imagens nem URLs de imagem. Só inclua um bloco de imagem (type "image") quando o texto original contiver um marcador no formato [IMAGEM: <url>]; nesse caso, no enunciado (stem) da questão correspondente, use "src" EXATAMENTE igual à <url> do marcador e um "alt" curto e descritivo (NUNCA deixe o "alt" vazio), e NÃO deixe o marcador literal [IMAGEM: ...] no texto de saída — substitua-o pelo bloco "image". Se uma figura ajudaria mas NÃO há marcador [IMAGEM:] no original, descreva-a em TEXTO (um parágrafo) — jamais gere um bloco "image" com URL inventada.
- LACUNAS — REGRA CRÍTICA: em "fillBlank", as lacunas são SUBLINHADOS literais dentro do texto (ex.: "Pirulito que bate ___"). NUNCA escreva marcadores de template como {gap1}, {{gap}} ou {lacuna2} em NENHUM campo de texto — eles saem crus na prova impressa. O campo "answer.gaps" carrega APENAS o gabarito de cada lacuna, na ordem em que os sublinhados aparecem no texto.
- Texto rico: o campo "content" é um array de inlines {type:"text", text:"..."} e/ou {type:"inlineMath", latex:"..."}.
- "strategies_applied": array de strings (estratégias pedagógicas aplicadas).
- "pedagogical_justification": string única (justificativa pedagógica das adaptações).
- "implementation_tips": array de strings (dicas práticas para o professor).
- Produza UMA ÚNICA versão adaptada da atividade (não gere "universal" e "direcionada" separadas).`;
}
