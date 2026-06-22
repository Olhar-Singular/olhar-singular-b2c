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
| **Auth** | `AuthPage`, `LandingPage` | `useAuth` | — | Signup ganha 50 créditos (trigger). |

## Onde mora a lógica

- `src/lib/adaptation/` — núcleo do Adaptar: documento **canônico** (`canonical/`: DSL, blocos, cores) + schema **Tiptap** (`tiptap/`). **Compartilhado** entre editor (browser) e edge function (Deno). Antes de mexer: skill `validate-adaptar`.
- `src/lib/domain/` — parsers e tipos (`questionParser`, `QuestionType`, `SUBJECTS`).
- `src/components/adaptation/render/pdf/` — geração de PDF (`@react-pdf/renderer`, math/LaTeX, fontes). **ÁREA FRÁGIL** → agente `pdf-debugger`.
- `supabase/functions/_shared/` — lógica testável das edge functions (o `index.ts` é só glue HTTP).
- `supabase/migrations/` — schema, RPCs de crédito, RLS (owner-based; super-admin cross-tenant).

## Gotchas de dados (mordem)

- Saldo de crédito = coluna **`credit_balance`** (NÃO `credits`).
- Documento adaptado vive em **`adaptations.adaptation_result->'document'`** (`->'blocks'` é o array de blocos canônicos). Coluna `content` antiga foi dropada (migration `20260604000000_adaptations_canonical`).
- 1ª adaptação grátis: flag **`profiles.free_adaptation_used`**; só depois debita.
- Edge function importa o pacote canônico com **extensão `.ts` explícita** (Vite resolve sem, Deno não).
- Pagamentos: Stripe = cartão, Mercado Pago = Pix; backend compartilhado (`credit_purchases` + `grant_credits`).

## Camadas de teste

Lógica/unit → **Vitest** (gate 100%). Banco/RPC/RLS → **pgTAP** (`make test-db`). Integração real (render Tiptap, bundle Deno, IA, UI) → skill **`validate-adaptar`** (cobertura 100% NÃO pega esses bugs).

## Manter este mapa vivo

Mudou um fluxo, caminho, coluna ou contrato citado aqui? **Atualize esta skill na mesma tarefa** (regra em CLAUDE.md → "manter skills e agentes atualizados").
