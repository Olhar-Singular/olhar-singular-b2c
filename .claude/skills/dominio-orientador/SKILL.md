---
name: dominio-orientador
description: >-
  Use ao começar uma tarefa numa área do Orientador Digital B2C que você ainda não
  conhece, ou ao precisar situar uma mudança no domínio. Triggers: "como funciona o
  fluxo X", "onde fica a lógica de Y", dúvida sobre Adaptar / créditos / barreiras /
  banco de questões / chat / admin, qual edge function/hook/página cobre um fluxo, ou
  qual coluna/contrato de dados usar. Mapa de domínio: fluxos → página + hook + edge
  function, onde mora cada camada de lógica, e os gotchas de dados que mordem.
---

# Domínio — Orientador Digital B2C

Plataforma educacional B2C. **Educadores adaptam atividades pedagógicas (provas, exercícios) para alunos com barreiras de aprendizagem (ex.: TEA), usando IA.** Monetização por **créditos** (cartão via Stripe, Pix via Mercado Pago). 1ª adaptação grátis; demais debitam crédito.

## Fluxos → onde estão

| Fluxo | Página | Hook(s) | Edge function | Resumo |
|-------|--------|---------|---------------|--------|
| **Adaptar** | `AdaptarPage`, `EditAdaptationPage`, `MyAdaptationsPage` | `useAdaptations`, `useAdaptationDraft` | `adapt-activity` | Wizard: Tipo → Atividade → Barreiras → Gerar (IA) → **Revisar** (superfície única Tiptap canônico: edição inline + card da questão + Aparência) → Exportar PDF. A **edge function** grava a linha em `adaptations` (draft) e o cliente só a atualiza por autosave. |
| **Perfis de barreira** | `BarrierProfilesPage` | `useBarrierProfiles` | — | Perfis (aluno + barreiras) reutilizados no passo "Barreiras". |
| **Banco de questões** | `QuestionBankPage` | `useQuestionBank` | `extract-questions` | Extrai questões de PDF de prova. |
| **Chat** | `ChatPage` | `useChatSessions`, `useSendMessage` | `chat` | Orientação pedagógica via IA. |
| **Créditos** | `CreditsPage`, `CreditsSuccessPage` | `useCredits` | `create-stripe-checkout`, `stripe-webhook`, `create-pix-payment`, `mp-webhook` | Compra: cartão redireciona pro Stripe; Pix abre o QR na própria página (`components/credits/PixPaymentDialog`). RPCs `deduct_credits`/`grant_credits`. |
| **Admin** | `AdminPage`, `DashboardPage` | `useAdminDashboard`, `useHistory` | `admin-dashboard`, `admin-grant-credits`, `admin-user-status` | Painel super-admin. |
| **Auth** | `AuthPage`, `ForgotPasswordPage`, `ResetPasswordPage`, `LandingPage` | `useAuth` | — | Signup (senha + confirmação por link) ganha 50 créditos (trigger). Pós-signup, `AuthPage` mostra a view "Verifique seu e-mail" com botão Reenviar (cooldown 60s) via `supabase.auth.resend({ type: "signup" })`. As 3 telas públicas compartilham o shell `components/auth/AuthLayout`. Templates: `supabase/templates/{confirmation,recovery}.html` (registrados no `config.toml`). |
| **Esqueci a senha** | `ForgotPasswordPage` (`/esqueci-senha`) → `ResetPasswordPage` (`/redefinir-senha`) | — | — | `resetPasswordForEmail(email, { redirectTo: <origin>/redefinir-senha })` → e-mail (`recovery.html`) → a página de destino recebe a sessão de recovery e chama `updateUser({ password })`, depois `signOut()` + volta pro login. Rotas **públicas** (fora do `ProtectedRoute`). |

## Onde mora a lógica

- `src/lib/adaptation/` — núcleo do Adaptar: documento **canônico** (`canonical/`: DSL, blocos, cores) + schema **Tiptap** (`tiptap/`). **Compartilhado** entre editor (browser) e edge function (Deno). Antes de mexer: skill `validate-adaptar`.
- `src/lib/domain/` — parsers e tipos (`questionParser`, `QuestionType`, `SUBJECTS`).
- `src/components/adaptation/render/pdf/` — geração de PDF (`@react-pdf/renderer`, math/LaTeX, fontes). **ÁREA FRÁGIL** → agente `pdf-debugger`.
- `supabase/functions/_shared/` — lógica testável das edge functions (o `index.ts` é só glue HTTP).
- `supabase/migrations/` — schema, RPCs de crédito, RLS (owner-based; super-admin cross-tenant).

## Gotchas de dados (mordem)

- Saldo de crédito = coluna **`credit_balance`** (NÃO `credits`).
- Documento adaptado vive em **`adaptations.adaptation_result->'document'`** (`->'blocks'` é o array de blocos canônicos). Coluna `content` antiga foi dropada (migration `20260604000000_adaptations_canonical`).
- Cabeçalho do PDF (título/escola/professor/data) vive em **`adaptation_result->'header'`** — sibling opcional de `document` (additive, igual ao `pageStyle`; ausente = sem header, legacy round-trip). Editado no passo **Exportar** (`ExportPanel` é controlado pelo wizard via `setHeader`), persiste pelo autosave. A coluna **`adaptations.title`** (usada no histórico, que não lê o blob) espelha o `header.title` manual; se vazio, cai no título derivado no servidor (`deriveAdaptationTitle`, 1ª linha de `original_activity`). Logo o "Título" de Exportar **é** o título do histórico.
- **Quem cria a linha em `adaptations` é a EDGE FUNCTION, não o cliente** (migration
  `20260723160000_adaptations_request_id`). `adapt-activity` insere o rascunho via service_role
  **antes** de dar `settle` na reserva (`_shared/adaptationPersistence.ts`) e devolve
  `adaptation_id` + `adaptation_updated_at`; o wizard só **adota** essa linha. Se o insert falha,
  a reserva é revertida — nunca se cobra por documento que não ficou gravado. A linha carrega o
  **`request_id`** (o mesmo id da reserva), com índice único parcial: replay não deixa adaptação
  duplicada. Não existe mais `saveDraft`/`wizardDataToPayload` no cliente — o que ele escreve são
  **updates** (`updateAdaptation`). Regerar = requisição paga nova = **linha nova** (o rascunho
  anterior continua no histórico).
- **Token de concorrência otimista é POR LINHA.** `useAdaptationDraft` religa
  `expectedUpdatedAt` sempre que o `draftId` muda (adoção da linha, "Nova adaptação"); carregar o
  `updated_at` da adaptação anterior fazia o 1º autosave da nova conflitar → `navigate(0)`.
  `markReady` também avança o `updated_at` no servidor, então o wizard devolve o valor retornado
  via **`syncUpdatedAt`** — sem isso, editar depois de "Salvar" conflita.
- **`flush()` devolve resultado, não token**: `{ status: "saved" | "failed" }`. `handleSave` **não**
  marca ready quando o flush falha — marcar mesmo assim dizia "Salvo" sobre edições que nunca
  subiram e ainda empurrava o `updated_at` à frente do mirror, fazendo a próxima abertura apagar a
  única cópia. (Discriminante é **string**: o projeto compila com `strictNullChecks: false`, onde
  TS não estreita união por literal booleano.)
- **Mirror de crash: divergência manda, não timestamp.** `shouldOfferRestore` compara o conteúdo do
  mirror com o `result` que o servidor carregou; só cai no timestamp quando não há resultado pra
  comparar. E a checagem só "trava" (`checkedMirrorFor`) **depois** de decidir — o app roda em
  `<StrictMode>`, que monta o efeito duas vezes: travar antes do await cancelava a 1ª execução e
  curto-circuitava a 2ª, então o prompt de recuperação **nunca** aparecia no browser.
- **O modelo canônico é estreito de propósito — o editor NUNCA pode produzir algo fora dele.**
  Um nó irrepresentável não é "meio inválido": `tryProseMirrorToCanonical` falha e o autosave
  para de capturar o documento **inteiro**, em silêncio. Quatro origens já corrigidas (B8):
  **(1)** `hardBreak` foi **desligado** no StarterKit — não há quebra inline no canônico, e um
  Shift+Enter virava `{type:"text",text:""}`, que validava mas o `Node.fromJSON` recusava no
  reload (folha em branco). Shift+Enter/Mod+Enter agora fazem `splitBlock` (extensão
  `BreakAsParagraph`), e `InlineText.text` é `.min(1)` — o que não recarrega não valida.
  **(2)** Attrs só-de-modelo (`answer`, `instruction`, `enunciado`, `style`, `items`, `caption`)
  **não podem ser `rendered:false`**: o clipboard do ProseMirror round-trippa por **HTML**
  (`data-pm-slice` só guarda profundidade), então colar uma questão a devolvia com `answer:null`.
  Agora viajam como JSON em `data-*` (helper `jsonAttribute` em `tiptap/schema.ts`); `width` usa
  `numberAttribute` porque atributo HTML volta string. **(3)** Cor colada (Word/Docs — e a nossa
  própria, que o DOM serializa como `rgb(...)`) passa por `normalizeColor` (`canonical/colors.ts`),
  que casa com a **cor mais próxima do allowlist**; `fontSize` passa por `normalizeFontSize`
  (`lib/tiptap/fontSizeExtension.ts`), senão `12pt` era lido como px e virava 9pt.
  **(4)** Nó novo nasce **válido**: `buildImageNode("")` usa `IMAGE_PLACEHOLDER_SRC` (PNG 1x1) e
  os NodeViews de math usam `useLatexDraft` — o campo continua apagável, mas `latex:""` nunca
  chega ao documento.
- **Falha de captura é VISÍVEL, nunca silenciosa.** `tryProseMirrorToCanonical` devolve
  `{ok:false, reason}`; `useCanonicalEditor` aceita `onCaptureFailure(reason|null)` (dispara só na
  transição) e o wizard troca o "Salvo" por **"Alterações não estão sendo salvas"** (`role=status`,
  `aria-live`, `title` com o motivo) + `console.warn`. Antes, congelado e salvo eram
  indistinguíveis na tela — que é o que tornava o B8 caro.
- **Export Word é lossy POR CONTRATO, e avisa antes de baixar** (`export/exportDocx.ts`). O PDF é
  a referência de fidelidade; o `.docx` espelha a apresentação do PDF (`PdfAnswer`/`PdfLeafBlocks`/
  `PdfQuestion`) — mesmo conteúdo, mesma ordem, **gabarito igualmente oculto**: marcadores vazios,
  `ordering` na ordem autoral (ordenar por `position` **seria** o gabarito) e `fillBlank` sem bloco
  de resposta (as lacunas vivem inline no enunciado — é paridade deliberada, **não** um mapper
  faltando). O que não sobrevive vira aviso de `docxExportWarnings` num diálogo **antes** do
  download (imagem não é embutida → marcação `[Imagem: alt]`; math sai como LaTeX; fonte de
  acessibilidade pode não existir na máquina de quem abre). Nunca faça o Word "dar sucesso" sobre
  perda silenciosa — era esse o bug. Fonte do Word sai de `fontFamilyToDocx` (mesmo ponto único de
  `fontFamilyToCss`/`ToPdf`), e `downloadDocx` recebe **`pageStyle`** (sem isso a fonte de
  acessibilidade não chega ao arquivo). Bloco/kind novo sem mapper quebra o teste de paridade em
  `exportDocx.test.ts`.
- **O editor precisa ressemear quando o documento muda por fora** (`useCanonicalEditor`): semear
  uma vez só fazia o "Recuperar" ser no-op visual — a folha seguia com o doc antigo e a 1ª tecla
  re-emitia ele, sobrescrevendo o recuperado. A guarda contra loop é o `lastDocRef` (o doc que o
  próprio editor emitiu volta igual e não ressemeia).
- **A linha aberta no editor não se refetcha** (`useAdaptation`: `staleTime: Infinity`,
  `refetchOnWindowFocus/OnMount: false`) e `EditAdaptationPage` usa `key={row.id}` — **sem** o
  `updated_at`. Como todo autosave bumpa o `updated_at`, a key antiga remontava o wizard no meio da
  edição (perdia cursor, scroll e passo, voltando pro Revisar) a cada refetch.
- **"Salvo" e "Salvar" são coisas DIFERENTES — e confundi-las escondia a adaptação.** O rótulo
  da barra do wizard é o **autosave do blob** (`SAVE_STATUS_LABEL`), que nunca toca a coluna
  `status`; quem promove `draft → ready` é o **`markReady`**, chamado só pelo `handleSave`. Como
  o rótulo passivo dizia "Salvo" primeiro, ninguém clicava em Salvar: **todas** as linhas do banco
  ficavam `draft` para sempre — e a `/adaptacoes` filtrava `status === "ready"`, então a prova
  paga simplesmente sumia. Hoje: rótulo é **"Rascunho salvo"**, a página **não filtra** (status é
  badge, não permissão — a linha é escrita pela edge fn **antes** de liquidar o crédito, logo tudo
  que está lá já foi pago) e o botão Salvar existe também na **Revisar**, não só no Exportar.
  `isSaved` volta a `false` a cada edição, senão o aviso de saída desarma para sempre depois do
  1º salvar.
- **Duas listas, dois papéis**: **`/adaptacoes`** (`AdaptacoesPage`) é a **biblioteca** — nome,
  pastas por matéria, editar, duplicar, excluir. **`/historico`** (`MyAdaptationsPage`, rotulado
  **"Atividade"** no menu) é o **log de consumo de crédito**, read-only, misturado com extrações.
  Não volte a tratá-las como duas versões da mesma tela.
- **Nome da adaptação = `result.header.title`**, editado na barra da Revisar. Não há campo novo:
  o autosave já espelha esse valor para a coluna `adaptations.title`, que é o que a listagem lê.
  O título derivado do documento é **placeholder**, nunca valor gravado — senão uma adaptação sem
  nome congelaria um palpite em vez de cair no título do servidor.
- **`adaptations.subject` é a "pasta" — coluna, nullable, e gravada junto do `markReady`.**
  `NULL` = não classificada; **'Geral' é matéria de verdade** e não serve de sentinela. Nunca
  torne `NOT NULL`: o `buildAdaptationInsert` do servidor não passa subject e roda **antes** de
  liquidar a reserva — quebrá-lo vira estorno de geração paga. E não a grave num UPDATE separado:
  ela viaja no mesmo write do `markReady` porque um segundo UPDATE bumparia o `updated_at` de novo
  e deixaria o token otimista uma versão atrás. O agrupamento por pasta é **no cliente** (não há
  query `where subject = ?`, e por isso a migration **não** tem índice — um
  `(user_id, subject, updated_at)` seria morto, já que `subject` sem filtro no meio impede o
  Postgres de aproveitar a ordenação; `idx_adaptations_user_updated` já serve a listagem).
- **"Salvar como nova" virou "Duplicar", e na LISTA de propósito.** Dentro do editor a escolha
  corre contra o autosave (grava na original a cada ~1200ms desde a 1ª tecla): quando o diálogo
  aparecesse, o "por cima" já teria acontecido, e a opção "nova" exigiria criar a cópia **e**
  reverter a original ao snapshot de abertura **e** limpar o mirror dela — senão o
  `shouldOfferRestore` ofereceria recuperar justo as edições levadas para a cópia. Da lista não há
  autosave em voo, token para religar nem mirror em jogo. A cópia **não** leva `request_id` (chave
  de idempotência da reserva, índice único parcial) nem `credits_spent`.
- **O prompt exige scaffolding — e o exemplo é código, não string** (`_shared/adaptationPrompt.ts`).
  Havia uma assimetria que sumia com os textos de apoio: das quatro linhas de "ADAPTAÇÃO POR TIPO
  DE ATIVIDADE", só **EXERCÍCIO** citava scaffolding ("pode incluir"); **PROVA** não citava e ainda
  mandava "preserve o número de questões". Como o upload direto gera `activityType: "prova"`, o
  modelo concluía que apoio era coisa de exercício e o omitia. Hoje há a seção **TEXTOS DE APOIO
  (SCAFFOLDING) — OBRIGATÓRIO** e a linha PROVA diz que apoio é esperado ali também. O few-shot vive
  em **`SCAFFOLDING_EXAMPLE_QUESTION`** (constante exportada, não trecho de string) justamente pro
  teste validá-lo contra o **`AiBlockSchema` real** — exemplo fora de sincronia com o schema ensina
  o modelo a emitir exatamente o que o validador recusa.
- **Três sinais do professor só chegam na IA porque alguém os liga explicitamente.** Todos já
  existiam nas pontas e morriam no meio: **(1)** `observationNotes` — o `observation` do perfil
  (até 2000 chars) é copiado no `handleProfileChange` (`StepBarrierSelection`); sem isso o PILAR 1
  do system prompt roda vazio, porque `rowMapping` só reidrata esse campo numa adaptação **já
  salva**. **(2)** `label` da barreira no payload de `StepGenerate` — sem ele o prompt mostra
  `dislexia_leitura` em vez da frase que descreve a barreira (e o `barriers_used` persistido guarda
  só chaves). **(3)** `fidelity_mode: !!data.uploadedExam` — o bloco MODO FIEL existia, era testado
  e era repassado pelo `index.ts`, mas **nenhum caller mandava o campo**. Ao ligá-lo, a 3ª regra do
  bloco teve de virar imperativa ("ADICIONE textos de apoio"): as duas primeiras são "inegociáveis"
  e puxam pra deixar a prova como está, então uma permissiva perdia a queda de braço e deixava a
  adaptação **mais** parecida com o original.
- **Gate semântico é OBSERVE-ONLY hoje** (`_shared/adaptationQuality.ts`, `inspectAdaptationQuality`).
  `interpretAiResponse` valida JSON + Zod, ou seja **sintaxe**: um documento que perdeu metade das
  questões, veio sem nenhum apoio ou com justificativa vazia é indistinguível de sucesso — e é
  cobrado igual. O gate calcula 3 sinais (`missing_questions`, `no_scaffolding`,
  `empty_justification`) e só faz `console.warn`; **não** dá reask nem derruba a request. A decisão
  que falta é de dinheiro (cobra? estorna? entrega com aviso?), e o caminho de crédito tem duas
  saídas só (`settle`/`reverse`) — por isso primeiro medimos a frequência. `expected_question_count`
  vem do cliente (extração ou seleção do banco); **0 = desconhecido** (texto digitado) e pula a
  checagem. Ao ligar enforcement, lembre que cada reask custa ~50s de um orçamento de 240s.
- 1ª adaptação grátis: flag **`profiles.free_adaptation_used`**; só depois debita. A flag é
  **reivindicada antes** da chamada de IA (UPDATE atômico `… WHERE free_adaptation_used = false`,
  pra fechar a corrida de duplo-grátis) e **devolvida em qualquer falha** — senão uma geração
  que dá timeout queima o grátis do usuário novo pra sempre.
- **Cobrança do Adaptar é por RESERVA, não por débito solto** (migration
  `20260723140633_credit_reservations`): `adapt-activity` chama **`open_adapt_reservation`**
  (reserva + free-first/débito **na mesma transação**), e só existem duas saídas —
  `settle_credit_reservation` logo antes do 200, ou `reverse_credit_reservation` em qualquer
  falha. O **`id` da reserva é o `request_id` que o cliente manda** (`StepGenerate` gera um
  `crypto.randomUUID()` por tentativa): é a chave de idempotência, então replay → **409**, não
  cobrança dupla. Reserva que fica `open` = isolate morreu no meio → o job
  **`reconcile_stale_credit_reservations()`** devolve crédito/grátis (agendado por pg_cron
  quando a extensão existe; senão roda à mão). Nunca debite direto no fluxo Adaptar — o débito
  sem reserva é justamente o bug que isso corrige. Cobertura: pgTAP `credit_reservations.test.sql`
  + `free_adaptation_claim.test.sql`; decisões puras em `_shared/creditReservation.ts`.
- **Toda RPC de dinheiro passa por `runCreditRpc` (`_shared/credits.ts`)**: supabase-js
  **resolve** (não rejeita) em erro de banco, então `await client.rpc("grant_credits", …)` sem
  ler `{ error }` parece sucesso — o try/catch do refund nunca dispara, o `onError` vira código
  morto e o usuário perde o crédito pago sem um log sequer. Mesma armadilha em `.insert()`
  (ver `logAiUsage`, que checa o `error` do insert).
- **Escrita de dinheiro é só service_role** (migration `20260722000001_harden_credit_paywall`): `deduct_credits`/`grant_credits` têm `REVOKE EXECUTE` de anon/authenticated (só edge fns via service_role chamam) e as colunas `credit_balance`/`free_adaptation_used`/`free_extraction_used` têm o trigger `prevent_credit_self_mutation` que barra UPDATE por JWT authenticated/anon. O cliente **nunca** escreve saldo/flags direto — sempre via edge function. Alterou essas RPCs? Use **`CREATE OR REPLACE`** (nunca `DROP`+`CREATE`, reabre o EXECUTE p/ PUBLIC). Cobertura: `credit_paywall_guard.test.sql`.
- **As funções de trigger também estão revogadas** (migration `20260816000000_harden_function_acls`, fecha os avisos do Supabase security advisor): `handle_new_user`, `prevent_credit_self_mutation` e `prevent_super_admin_self_escalation` perderam o EXECUTE default de anon/authenticated, e `handle_updated_at`/`get_user_school_id` ganharam `search_path = public`. Isso **não** afeta o disparo: o Postgres checa EXECUTE na criação do trigger, não quando ele roda. Vale a mesma regra do `CREATE OR REPLACE`. Cobertura: `function_hardening.test.sql`.
- Edge function importa o pacote canônico com **extensão `.ts` explícita** (Vite resolve sem, Deno não).
- **Custo de IA** (`ai_usage_logs`/`ai_model_pricing`, alimenta o "Gasto (IA)" do Admin): pricing é chaveado pelo id **canônico** (`google/gemini-2.5-pro`), mas as edge functions trabalham com o nome **resolvido** pela `MODEL_MAP` (`gemini-2.5-pro`). `logAiUsage` canonicaliza via `toCanonicalModel` (`_shared/aiConfig.ts`) antes de precificar e gravar — nunca contorne isso logando direto na tabela, senão `cost_total` sai 0.
- Pagamentos: **dois provedores, um por trilho.** Cartão = Stripe (`create-stripe-checkout` + `stripe-webhook`); Pix = Mercado Pago **Checkout Transparente** (`create-pix-payment` + `mp-webhook`). `credit_purchases.payment_method` (`'card'|'pix'`) grava qual foi e `provider` (`'stripe'|'mercadopago'`) qual rail. O campo `method` do `create-stripe-checkout` (`_shared/stripeCheckoutParams.ts`) ainda aceita `"pix"`, mas a UI não manda mais: é caminho dormente, mantido só como plano B.
- **Pix não redireciona: o QR nasce na nossa página.** `create-pix-payment` faz `POST https://api.mercadopago.com/v1/payments` (body por `_shared/mpPixPayment.ts` → `buildPixPaymentBody`, valor em **reais**, não centavos) e devolve `{ qrCode, qrCodeBase64, purchaseId, ticketUrl }`; `PixPaymentDialog` mostra a imagem + copia-e-cola sem o comprador sair do app nem logar no MP. Era exatamente isso que o Checkout Pro (removido) quebrava: a página hospedada exigia login e dizia "saldo insuficiente".
- **O token do Pix é `ACCESS_TOKEN_MP_PROD`, não `ACCESS_TOKEN_MP`.** O antigo responde "Unauthorized use of live credentials" no `/v1/payments`. Tanto `create-pix-payment` quanto `mp-webhook` (que relê o pagamento em `/v1/payments/{id}`) usam o `_PROD`. Assinatura do webhook: `VERIFY_TOKEN_MP_PROD` (`_shared/mpSignature.ts`).
- **A confirmação do Pix é assíncrona e o cliente só descobre por polling.** O crédito entra quando o `mp-webhook` recebe `{type:"payment"}`, relê o pagamento e vê `status === "approved"` (`extractApprovedGrant`) → `grant_credits`. `rejected`/`cancelled` → `extractRejectedPurchase` marca a compra `rejected`, **escopado em `.eq("status","pending")`** pra nunca rebaixar uma já aprovada. No front, `usePixPurchaseStatus` lê `credit_purchases.status` a cada 3s (RLS de dono) e para quando assenta (`pixPollInterval`); só então o dialog chama `refreshProfile()` + invalida `["credit_transactions"]`. QR expira em 1h (`PIX_EXPIRES_AFTER_SECONDS` em `mpPixPayment.ts`). **`date_of_expiration` precisa do offset explícito** (`...-03:00`); um `Z` cru o MP recusa.
- **Deploy de function é MANUAL** (o job do CI quebra antes): `supabase functions deploy create-pix-payment --project-ref …` e `… mp-webhook --no-verify-jwt --project-ref …`, com os secrets `ACCESS_TOKEN_MP_PROD`/`VERIFY_TOKEN_MP_PROD`/`APP_URL` setados no remoto.
- Pacotes compráveis = whitelist `ALLOWED_PACKAGES` em `functions/_shared/creditPackages.ts` (fora dela → 400). O **`TEST_PACKAGE`** (1 crédito · R$1,00, smoke de pagamento real) fica **fora** da whitelist: os dois checkouts (`create-stripe-checkout` e `create-pix-payment`) o aceitam, e só se o comprador tiver `is_super_admin` (`findPackage(..., { allowTest })`); na `CreditsPage` o card "Teste (admin)" só renderiza pra super-admin (cartão **e** Pix — R$1 passa do mínimo de R$0,50 do Pix).
- **Reset de senha**: a sessão de recovery **é uma sessão real** — abrir o link do e-mail já deixa o usuário autenticado no `AuthContext` (dá pra ir ao `/dashboard` sem trocar a senha). Por isso `ResetPasswordPage` faz `signOut()` após o `updateUser`. Fluxo é **implicit** (`{{ .ConfirmationURL }}`), não PKCE.
- **`redirectTo` só é honrado se estiver em `auth.additional_redirect_urls`** (`config.toml`). Mudou a porta do dev server? Acrescente a URL lá, senão o link cai no `site_url` e a tela de nova senha nunca recebe a sessão.
- Em `parseAuthError`, o teste de `"should be different"` **precisa vir antes** do catch-all `includes("password")` — senão "senha repetida" vira "senha muito fraca".

## Camadas de teste

Lógica/unit → **Vitest** (gate 100%). Banco/RPC/RLS → **pgTAP** (`make test-db`). Integração real (render Tiptap, bundle Deno, IA, UI) → skill **`validate-adaptar`** (cobertura 100% NÃO pega esses bugs).

## Manter este mapa vivo

Mudou um fluxo, caminho, coluna ou contrato citado aqui? **Atualize esta skill na mesma tarefa** (regra em CLAUDE.md → "manter skills e agentes atualizados").
