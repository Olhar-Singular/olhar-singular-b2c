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
| **Adaptar** | `AdaptarPage`, `EditAdaptationPage`, `MyAdaptationsPage` | `useAdaptations`, `useAdaptationDraft` | `adapt-activity` | Wizard: Tipo → Atividade → Barreiras → Gerar (IA) → **Revisar** (superfície única Tiptap canônico: edição inline + card da questão + Aparência) → Exportar PDF. Persiste em `adaptations`. |
| **Perfis de barreira** | `BarrierProfilesPage` | `useBarrierProfiles` | — | Perfis (aluno + barreiras) reutilizados no passo "Barreiras". |
| **Banco de questões** | `QuestionBankPage` | `useQuestionBank` | `extract-questions` | Extrai questões de PDF de prova. |
| **Chat** | `ChatPage` | `useChatSessions`, `useSendMessage` | `chat` | Orientação pedagógica via IA. |
| **Créditos** | `CreditsPage` | `useCredits` | `create-stripe-checkout`, `create-checkout`, `stripe-webhook`, `mp-webhook` | Compra. RPCs `deduct_credits`/`grant_credits`. |
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
- Cabeçalho do PDF (título/escola/professor/data) vive em **`adaptation_result->'header'`** — sibling opcional de `document` (additive, igual ao `pageStyle`; ausente = sem header, legacy round-trip). Editado no passo **Exportar** (`ExportPanel` é controlado pelo wizard via `setHeader`), persiste pelo autosave. A coluna **`adaptations.title`** (usada no histórico, que não lê o blob) espelha o `header.title` manual; se vazio, cai no `deriveTitle` (1ª linha de `original_activity`). Logo o "Título" de Exportar **é** o título do histórico.
- 1ª adaptação grátis: flag **`profiles.free_adaptation_used`**; só depois debita.
- **Escrita de dinheiro é só service_role** (migration `20260722000001_harden_credit_paywall`): `deduct_credits`/`grant_credits` têm `REVOKE EXECUTE` de anon/authenticated (só edge fns via service_role chamam) e as colunas `credit_balance`/`free_adaptation_used`/`free_extraction_used` têm o trigger `prevent_credit_self_mutation` que barra UPDATE por JWT authenticated/anon. O cliente **nunca** escreve saldo/flags direto — sempre via edge function. Alterou essas RPCs? Use **`CREATE OR REPLACE`** (nunca `DROP`+`CREATE`, reabre o EXECUTE p/ PUBLIC). Cobertura: `credit_paywall_guard.test.sql`.
- Edge function importa o pacote canônico com **extensão `.ts` explícita** (Vite resolve sem, Deno não).
- **Custo de IA** (`ai_usage_logs`/`ai_model_pricing`, alimenta o "Gasto (IA)" do Admin): pricing é chaveado pelo id **canônico** (`google/gemini-2.5-pro`), mas as edge functions trabalham com o nome **resolvido** pela `MODEL_MAP` (`gemini-2.5-pro`). `logAiUsage` canonicaliza via `toCanonicalModel` (`_shared/aiConfig.ts`) antes de precificar e gravar — nunca contorne isso logando direto na tabela, senão `cost_total` sai 0.
- Pagamentos: Stripe = cartão, Mercado Pago = Pix; backend compartilhado (`credit_purchases` + `grant_credits`).
- Pacotes compráveis = whitelist `ALLOWED_PACKAGES` em `functions/_shared/creditPackages.ts` (fora dela → 400). O **`TEST_PACKAGE`** (1 crédito · R$1,00, smoke de pagamento real) fica **fora** da whitelist: só o checkout **Stripe** o aceita, e só se o comprador tiver `is_super_admin` (`findPackage(..., { allowTest })`); na `CreditsPage` o card "Teste (admin)" só renderiza pra super-admin (só cartão, sem Pix).
- **Reset de senha**: a sessão de recovery **é uma sessão real** — abrir o link do e-mail já deixa o usuário autenticado no `AuthContext` (dá pra ir ao `/dashboard` sem trocar a senha). Por isso `ResetPasswordPage` faz `signOut()` após o `updateUser`. Fluxo é **implicit** (`{{ .ConfirmationURL }}`), não PKCE.
- **`redirectTo` só é honrado se estiver em `auth.additional_redirect_urls`** (`config.toml`). Mudou a porta do dev server? Acrescente a URL lá, senão o link cai no `site_url` e a tela de nova senha nunca recebe a sessão.
- Em `parseAuthError`, o teste de `"should be different"` **precisa vir antes** do catch-all `includes("password")` — senão "senha repetida" vira "senha muito fraca".

## Camadas de teste

Lógica/unit → **Vitest** (gate 100%). Banco/RPC/RLS → **pgTAP** (`make test-db`). Integração real (render Tiptap, bundle Deno, IA, UI) → skill **`validate-adaptar`** (cobertura 100% NÃO pega esses bugs).

## Manter este mapa vivo

Mudou um fluxo, caminho, coluna ou contrato citado aqui? **Atualize esta skill na mesma tarefa** (regra em CLAUDE.md → "manter skills e agentes atualizados").
