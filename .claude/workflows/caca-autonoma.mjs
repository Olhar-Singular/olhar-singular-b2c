export const meta = {
  name: 'caca-autonoma',
  description: 'Caça bugs visuais dirigindo o app no browser e corrige com TDD, sem supervisão',
  whenToUse: 'Varredura autônoma prolongada com o usuário ausente. Acha a classe de bug que não gera log (layout quebrado, elemento cortado, estado que não re-renderiza, paridade PDF x tela) e corrige numa branch isolada, um commit por achado, sem nunca pushar. Ler a skill caca-autonoma antes.',
  phases: [
    { title: 'Preflight', detail: 'checa árvore limpa, ambiente no ar, branch pronta' },
    { title: 'Captura', detail: 'UM agente dirige o browser e coleta evidência (serial: browser é recurso único)' },
    { title: 'Análise', detail: 'agentes em paralelo leem a evidência capturada e registram achados' },
    { title: 'Correção', detail: 'serial: árvore de trabalho e container são recursos únicos' },
    { title: 'Relatório', detail: 'regenera o índice legível da fila' },
  ],
}

// ─────────────────────────────────────────────────────────────
//  Configuração
// ─────────────────────────────────────────────────────────────
const REPO = '/home/alexandredev/my projects/orientador-digital-b2c'
const CACA = '/home/alexandredev/my projects/orientador-caca'
const BRANCH = 'caca/correcoes'
const APP = 'http://localhost:3000'

const a = args || {}
const RONDAS = a.rondas || 1
const MAX_CORRECOES = a.maxCorrecoes || 6
const ANALISTAS = a.analistas || 4
const SO_CACAR = a.soCacar === true

// Cenários de captura: estado de dado x viewport. É aqui que se decide o que o
// caçador exercita. Bug visual mora na combinação, não no arquivo.
const CENARIOS = a.cenarios || [
  { nome: 'questao-longa-sem-quebra', viewport: '1366x768', dado: 'enunciado de ~1200 caracteres sem espaços longos + 5 alternativas' },
  { nome: 'oito-alternativas-mobile', viewport: '390x844', dado: 'questão com 8 alternativas, texto médio' },
  { nome: 'imagem-grande', viewport: '1920x1080', dado: 'questão com imagem larga (mais larga que a folha A4)' },
  { nome: 'math-inline', viewport: '1366x768', dado: 'questão com LaTeX inline e display' },
  { nome: 'paridade-pdf', viewport: '1366x768', dado: 'documento misto (texto + imagem + math), exporta PDF e compara com a tela' },
]

const CONTEXTO_COMUM = `
Projeto: Orientador Digital B2C, em ${REPO}.
Leia a skill do projeto \`caca-autonoma\` (.claude/skills/caca-autonoma/SKILL.md) ANTES de agir:
ela tem as restrições deste repo que quebram o trabalho se ignoradas.
Fila de achados (FORA do repo, de propósito): ${CACA}
`

const SCHEMA_PREFLIGHT = {
  type: 'object',
  properties: {
    ok: { type: 'boolean', description: 'true só se TUDO abaixo está satisfeito' },
    arvoreLimpa: { type: 'boolean' },
    appNoAr: { type: 'boolean' },
    branchPronta: { type: 'boolean' },
    bloqueio: { type: 'string', description: 'se ok=false, o motivo exato e o que o humano precisa fazer' },
  },
  required: ['ok', 'arvoreLimpa', 'appNoAr', 'branchPronta', 'bloqueio'],
  additionalProperties: false,
}

const SCHEMA_CAPTURA = {
  type: 'object',
  properties: {
    evidencias: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          cenario: { type: 'string' },
          viewport: { type: 'string' },
          pasta: { type: 'string', description: 'caminho absoluto da pasta com screenshots e notas' },
          passos: { type: 'string', description: 'passos exatos para reproduzir este estado' },
          suspeitas: { type: 'string', description: 'o que pareceu errado, sem julgar ainda' },
        },
        required: ['cenario', 'viewport', 'pasta', 'passos', 'suspeitas'],
        additionalProperties: false,
      },
    },
  },
  required: ['evidencias'],
  additionalProperties: false,
}

const SCHEMA_ANALISE = {
  type: 'object',
  properties: {
    achados: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          id: { type: 'string' },
          arquivoFila: { type: 'string', description: 'caminho do .md criado em fila/' },
          titulo: { type: 'string' },
          gravidade: { type: 'string', enum: ['quebra', 'correcao-incorreta', 'qualidade'] },
          novo: { type: 'boolean', description: 'false se era duplicata de achado já na fila' },
        },
        required: ['id', 'arquivoFila', 'titulo', 'gravidade', 'novo'],
        additionalProperties: false,
      },
    },
  },
  required: ['achados'],
  additionalProperties: false,
}

const SCHEMA_CORRECAO = {
  type: 'object',
  properties: {
    id: { type: 'string' },
    status: { type: 'string', enum: ['corrigido', 'bloqueado'] },
    commit: { type: 'string', description: 'SHA curto, ou vazio se bloqueado' },
    resumo: { type: 'string' },
    motivoBloqueio: { type: 'string' },
  },
  required: ['id', 'status', 'commit', 'resumo', 'motivoBloqueio'],
  additionalProperties: false,
}

// ─────────────────────────────────────────────────────────────
//  Fase 1 — Preflight (bloqueante: nada roda se isto falhar)
// ─────────────────────────────────────────────────────────────
phase('Preflight')

const pre = await agent(
  `${CONTEXTO_COMUM}
Você é o preflight de uma varredura autônoma. NÃO edite código e NÃO corrija nada.
Verifique e, onde for seguro, prepare:

1. \`git -C "${REPO}" status --porcelain\` está VAZIO. Se houver arquivo modificado,
   pare: é trabalho não commitado de outra sessão e o primeiro commit desta varredura
   engoliria tudo (o pre-commit deste repo arrasta arquivo não-staged). Reporte ok=false.
2. A branch \`${BRANCH}\` existe (crie a partir da main se não existir) e o repo está NELA.
3. O app responde em ${APP}. Se não, suba com \`make verify-adaptar\` a partir de ${REPO}
   e espere ficar de pé (pode levar alguns minutos).
4. A pasta ${CACA}/fila existe.

Retorne o veredito estruturado. Seja honesto: ok=true só se os quatro estão satisfeitos.`,
  { label: 'preflight', phase: 'Preflight', effort: 'medium', schema: SCHEMA_PREFLIGHT },
)

if (!pre || !pre.ok) {
  log(`ABORTADO no preflight: ${pre ? pre.bloqueio : 'agente não retornou'}`)
  return { abortado: true, motivo: pre ? pre.bloqueio : 'preflight sem retorno' }
}
log('Preflight ok. Ambiente no ar, árvore limpa, branch pronta.')

// ─────────────────────────────────────────────────────────────
//  Rondas
// ─────────────────────────────────────────────────────────────
const todosAchados = []
const todasCorrecoes = []
let secas = 0

for (let ronda = 1; ronda <= RONDAS; ronda++) {
  if (secas >= 2) {
    log(`Duas rondas seguidas sem achado novo. Encerrando na ronda ${ronda}.`)
    break
  }
  if (budget.total && budget.remaining() < 80000) {
    log(`Orçamento abaixo do piso de segurança (${Math.round(budget.remaining() / 1000)}k). Encerrando.`)
    break
  }

  // ── Captura: UM agente. O browser é recurso único; paralelizar aqui colide na aba.
  phase('Captura')
  const captura = await agent(
    `${CONTEXTO_COMUM}
Ronda ${ronda}. Você é o CAÇADOR e é o único agente com o browser. NÃO edite código.

Use o Chrome DevTools MCP para dirigir o app em ${APP} pelo fluxo Adaptar
(Tipo → Atividade → Barreiras → Gerar → Revisar → Exportar).

Para CADA cenário abaixo: monte o estado, ajuste o viewport, percorra o fluxo até Revisar
(e Exportar quando o cenário pedir), e salve a evidência em ${CACA}/evidencias/r${ronda}-<cenario>/:
screenshot de cada tela relevante, mensagens do console, e um \`notas.md\` com os passos exatos.

Cenários desta ronda:
${CENARIOS.map((c) => `- ${c.nome} @ ${c.viewport}: ${c.dado}`).join('\n')}

Procure o que NÃO vira log nem exceção: overflow horizontal, elemento cortado ou sobreposto,
texto invisível, contraste ruim, foco perdido, estado que não re-renderiza após ação,
e divergência entre o PDF exportado e a tela.

Você COLETA, não julga. Registre suspeitas sem concluir se é bug. Se um cenário não for
montável, diga isso na suspeita em vez de inventar.
Antes de recomeçar, leia ${CACA}/PROGRESSO.md (se existir) e não revarra o já coberto;
atualize esse arquivo ao terminar.`,
    { label: `captura:r${ronda}`, phase: 'Captura', effort: 'high', schema: SCHEMA_CAPTURA },
  )

  const evidencias = (captura && captura.evidencias) || []
  if (!evidencias.length) {
    log(`Ronda ${ronda}: captura não produziu evidência.`)
    secas++
    continue
  }
  log(`Ronda ${ronda}: ${evidencias.length} evidências capturadas.`)

  // ── Análise: aqui a paralelização é legítima. Sem browser, sem árvore de trabalho.
  phase('Análise')
  const lotes = []
  for (let i = 0; i < ANALISTAS; i++) {
    const lote = evidencias.filter((_, idx) => idx % ANALISTAS === i)
    if (lote.length) lotes.push(lote)
  }

  const analises = await parallel(
    lotes.map((lote, i) => () =>
      agent(
        `${CONTEXTO_COMUM}
Ronda ${ronda}. Você é ANALISTA ${i + 1}. NÃO edite código de produção e NÃO use o browser.

Examine a evidência já capturada nestas pastas:
${lote.map((e) => `- ${e.pasta} (cenário ${e.cenario} @ ${e.viewport})\n  passos: ${e.passos}\n  suspeitas: ${e.suspeitas}`).join('\n')}

Leia os screenshots. Para cada problema REAL, rastreie até o código que o causa
(use a skill \`dominio-orientador\` para se situar) e registre um arquivo por achado em
${CACA}/fila/, no formato de frontmatter que a skill \`caca-autonoma\` define
(id, status: pendente, gravidade, area, arquivo:linha, viewport, screenshot).

Regras:
- Liste ${CACA}/fila/ ANTES de criar qualquer coisa e pule duplicata (marque novo=false).
- Ids sequenciais de 4 dígitos, continuando a numeração existente.
- Sem screenshot e passos exatos, o achado não serve. Copie os dois para o arquivo.
- Suspeita que você não conseguiu confirmar no código NÃO vira achado. Descarte.`,
        { label: `analise:${i + 1}`, phase: 'Análise', effort: 'high', schema: SCHEMA_ANALISE },
      ),
    ),
  )

  const novos = analises
    .filter(Boolean)
    .flatMap((r) => r.achados || [])
    .filter((f) => f.novo)

  todosAchados.push(...novos)
  log(`Ronda ${ronda}: ${novos.length} achados novos (${todosAchados.length} no total).`)
  if (!novos.length) { secas++; continue }
  secas = 0

  if (SO_CACAR) {
    log('Modo só-caçar: pulando a fase de correção.')
    continue
  }

  // ── Correção: SERIAL. Árvore de trabalho e container são recursos únicos.
  phase('Correção')
  const fila = novos
    .slice()
    .sort((x, y) => {
      const peso = { quebra: 0, 'correcao-incorreta': 1, qualidade: 2 }
      return peso[x.gravidade] - peso[y.gravidade]
    })
    .slice(0, MAX_CORRECOES)

  if (fila.length < novos.length) {
    log(`ATENÇÃO: ${novos.length - fila.length} achados ficaram na fila sem correção nesta ronda (teto ${MAX_CORRECOES}).`)
  }

  for (const achado of fila) {
    if (budget.total && budget.remaining() < 80000) {
      log('Orçamento no piso. Parando as correções; a fila fica pendente para a próxima execução.')
      break
    }

    const r = await agent(
      `${CONTEXTO_COMUM}
Você é o CORRETOR. Corrija UM achado e só ele: ${achado.arquivoFila} (${achado.titulo}).

Contrato, sem exceção:
1. Marque o status do achado como \`corrigindo\`.
2. TDD: escreva PRIMEIRO um teste que falha reproduzindo o bug. Veja falhar. Só então corrija.
3. Rode \`make test\` INTEIRO a partir de ${REPO}. Tem que passar. \`npm run typecheck\`
   não checa nada neste repo, então o Vitest é a única rede.
4. Commit: um commit só, nesta correção, na branch ${BRANCH}, mensagem seguindo a skill
   \`commit-crafting\` e citando o id ${achado.id}. Use \`git commit --no-verify\` DEPOIS de
   ter rodado os testes na mão: o pre-commit deste repo arrasta arquivo não-staged.
5. NUNCA \`git push\`. NUNCA commitar na main. NUNCA \`db push\` nem deploy de function.
6. Se a correção exigir mudar contrato público, schema canônico de \`src/lib/adaptation/\`,
   ou se \`make test\` não passar: reverta o que fez, marque o achado como \`bloqueado\`
   com o motivo, e retorne status=bloqueado. Bloquear é resultado aceitável; improvisar
   em área frágil não é.
7. Atualize o arquivo do achado com o que foi feito e o SHA.`,
      { label: `fix:${achado.id}`, phase: 'Correção', effort: 'medium', schema: SCHEMA_CORRECAO },
    )

    if (r) {
      todasCorrecoes.push(r)
      log(`${achado.id}: ${r.status}${r.commit ? ' (' + r.commit + ')' : ''}`)
    }
  }
}

// ─────────────────────────────────────────────────────────────
//  Relatório
// ─────────────────────────────────────────────────────────────
phase('Relatório')
await agent(
  `${CONTEXTO_COMUM}
Regenere ${CACA}/RELATORIO.md a partir dos arquivos em ${CACA}/fila/.

Escreva para alguém que acabou de acordar e não acompanhou nada: comece pelo resultado
(quantos achados, quantos corrigidos, quantos bloqueados e por quê), depois a tabela por
gravidade com id, título, arquivo:linha, status e SHA do commit. Termine com o que precisa
de decisão humana: os bloqueados e o comando para revisar tudo
(\`git -C "${REPO}" log --oneline main..${BRANCH}\`) ou descartar (\`git branch -D ${BRANCH}\`).
Sem jargão criado durante o trabalho. Frases completas.`,
  { label: 'relatorio', phase: 'Relatório', effort: 'low' },
)

const corrigidos = todasCorrecoes.filter((c) => c.status === 'corrigido')
const bloqueados = todasCorrecoes.filter((c) => c.status === 'bloqueado')
log(`FIM: ${todosAchados.length} achados, ${corrigidos.length} corrigidos, ${bloqueados.length} bloqueados.`)

return {
  achados: todosAchados.length,
  corrigidos: corrigidos.length,
  bloqueados: bloqueados.map((b) => ({ id: b.id, motivo: b.motivoBloqueio })),
  relatorio: `${CACA}/RELATORIO.md`,
  branch: BRANCH,
}
