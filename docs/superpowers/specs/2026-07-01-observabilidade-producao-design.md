# Observabilidade de produção — Sentry + aba "Saúde" no Admin — design

> Status: **aprovado em conversa, aguardando revisão do doc**. Data: 2026-07-01.
> Decisões do usuário: foco em **produção** (usuários reais); **Sentry + aba Saúde no Admin**
> (não "tudo em casa"); **sem Session Replay no v1** (postura LGPD conservadora).

## 1. Contexto e problema

Os últimos bugs de produção (CSP do preview de PDF, domínio do logo no e-mail de confirmação,
imagem sobrepondo conteúdo no PDF) foram descobertos **por relato de usuário** e reproduzidos
no escuro. Hoje não existe nenhum lugar onde um erro de produção fica registrado e consultável:

- **Frontend**: o `ErrorBoundary` global (`src/components/common/ErrorBoundary.tsx`) só faz
  `console.error` — o crash morre no navegador do usuário. Erros de query/mutation viram toast
  (`sonner`) e desaparecem. Não há `window.onerror`/`unhandledrejection` globais, nem APM.
- **Edge functions**: só chamadas de **IA** são logadas na tabela `ai_usage_logs`
  (status `success|error|timeout`, duração, tokens, custo, `error_message` truncada em 300
  chars, via `_shared/logAiUsage.ts`). Erros fora de IA (webhooks Stripe/MP, checkout, admin)
  vão para `console.error` — presos no dashboard do Supabase, com retenção curta.
- **Admin** (`AdminPage` + edge fn `admin-dashboard`): mostra custos de IA e usuários;
  **zero visibilidade de erros ou saúde**.

## 2. Objetivo e forma geral

Quando algo quebrar na mão de um usuário — crash de React, edge function falhando, pagamento
que não vira crédito — o time fica sabendo **por alerta** e vê o erro **com stack trace
legível**, sem depender de relato. Duas camadas complementares:

```text
Browser (React)  ──erros──▶  Sentry  ◀──erros──  Edge Functions (Deno)
      │                        │
      │                   e-mail de alerta (default do Sentry)
      ▼
ai_usage_logs / credit_purchases ──▶ admin-dashboard ──▶ aba "Saúde" (AdminPage)
```

- **Sentry** responde *"o que quebrou e onde no código"* (captura técnica, agrupamento,
  alertas). Free tier: ~5k eventos/mês — suficiente; tracing desligado para não comer quota.
- **Aba Saúde** responde *"o negócio está saudável?"* (taxa de erro das adaptações, timeouts,
  pagamentos travados) — agregando dados **que já são gravados** hoje. Sem migration nova.

## 3. Peça 1 — Sentry no frontend

- Novo módulo **`src/lib/monitoring/`** com `initMonitoring()`: inicializa `@sentry/react`
  **somente se `VITE_SENTRY_DSN` existir**; dev local e testes viram no-op silencioso.
  Init defensivo (try/catch): o SDK **nunca** pode derrubar o app.
- Captura automática do SDK: `window.onerror`, `unhandledrejection`, breadcrumbs de
  navegação/cliques/fetch — contexto de "o que o usuário fez antes" sem gravar tela.
- **`ErrorBoundary.componentDidCatch`** passa a reportar ao Sentry (mantendo o
  `console.error`) — cobre os crashes de render que hoje somem.
- **Erros de query/mutation**: `onError` global no `QueryCache`/`MutationCache` do TanStack
  Query, **só para reporte** — os toasts por hook continuam intactos (zero mudança de UX).
- **Source maps**: `@sentry/vite-plugin` no build de produção faz upload dos maps e os
  **remove do bundle publicado** — stack trace aponta para o TypeScript original.
  `release` = SHA do commit (Vercel expõe `VERCEL_GIT_COMMIT_SHA` no build), então cada erro
  linka o deploy que o introduziu. `environment` distingue production/preview.
- **Identificação**: `Sentry.setUser({ id })` no auth context — **só o UUID** (pseudônimo),
  para contar usuários afetados e cruzar com o Supabase quando necessário.

## 4. Peça 2 — Sentry nas edge functions

- Helper **`supabase/functions/_shared/sentry.ts`** (mesmo padrão do `logAiUsage.ts`):
  `captureEdgeError(err, ctx)` com tag da function + `action_type`, usando o SDK Deno do
  Sentry, ativo só se o secret **`SENTRY_DSN`** existir (senão, no-op).
- Chamado nos `catch` externos das 10 functions — a resposta `{ error }` ao cliente **não
  muda**; só ganha reporte. **Flush garantido**: `await flush` com timeout curto (~2s) dentro
  do `catch`, antes de responder — a edge function pode morrer antes do envio assíncrono, e
  latência extra num caminho que já é de erro é aceitável.
- **Nunca anexa payloads** (`original_activity`, mensagens de chat, corpo de request) —
  só mensagem, stack e metadados técnicos (function, status HTTP, user id).

## 5. Peça 3 — Aba "Saúde" no Admin

- A edge function `admin-dashboard` ganha um bloco **`health`** na resposta, com a lógica
  agregadora em `_shared/` (testável por Vitest, seguindo a regra "índex é só glue"):
  - **Taxa de sucesso/erro/timeout** e **latência (média/p95)** por `action_type`
    (janelas 24h e 7 dias), de `ai_usage_logs`.
  - **Últimos 20 erros** de `ai_usage_logs` (quando, `action_type`, `error_message`, user).
  - **Anomalias de pagamento** de `credit_purchases`: compras `pending` mais velhas que
    **30 min** e `rejected`/`cancelled` dos últimos 7 dias — pagamento que não creditou é o
    bug mais caro possível.
- Na `AdminPage`, nova seção **`HealthSection`**: cards de taxa de erro/timeout + tabela de
  últimos erros + destaque de anomalias de pagamento. Leitura via service role na edge fn
  (padrão atual do `admin-dashboard`); **sem migration, sem RLS nova**.

## 6. Privacidade (LGPD)

Atividades contêm dados de alunos com barreiras — dado pessoal sensível. Postura do v1:

- **Sem Session Replay** (decidido; dá para reavaliar depois — com máscara total, se vier).
- `sendDefaultPii: false`; usuário identificado só por UUID.
- Nenhum conteúdo de atividade/aluno sai para o Sentry (nem em breadcrumb, nem em extra).
- Dados de negócio (logs de uso, pagamentos) permanecem no banco próprio (aba Saúde).

## 7. Fora do escopo v1 (YAGNI)

Performance tracing (desligado), uptime monitoring, alertas custom (Slack/webhook), tabela
própria de `error_logs`, session replay, instrumentação de dev local.

## 8. Testes e gate de cobertura

- **Vitest (gate 100% mantido)**: módulo `src/lib/monitoring/` com `@sentry/react` mockado;
  `ErrorBoundary` reportando; `onError` global do QueryClient; agregação de `health` em
  `supabase/functions/_shared/` com client Supabase mockado (padrão dos testes de `_shared`).
- **Risco conhecido**: `_shared/sentry.ts` importa SDK via specifier Deno (`npm:`), que o
  Vitest não resolve — isolar o import num adapter fino (injeção de dependência), deixando a
  lógica testável; o adapter fica na mesma classe de exclusão do glue `index.ts`.
- **pgTAP**: nada novo (nenhuma RPC/RLS alterada).
- **Validação real** (skill `validate-adaptar` como referência de método): disparar um erro
  de teste em preview/produção e confirmar o evento no Sentry com source map resolvido.

## 9. Pré-requisitos operacionais (usuário)

1. Criar conta/organização no Sentry + **2 projetos** (padrão Sentry para SDKs distintos):
   um para o frontend React (com source maps) e um para as edge functions Deno.
2. Fornecer os valores para os envs (nunca hardcodados, regra do projeto):
   - `VITE_SENTRY_DSN` — frontend (Vercel env + `.env` local opcional).
   - `SENTRY_DSN` — secret das edge functions (Supabase secrets).
   - `SENTRY_AUTH_TOKEN` + org/projeto — **só build** (Vercel), para upload de source maps.
3. `.env.example` atualizado com os três, documentando que vazios = monitoring desligado.

## 10. Fases de entrega (cada uma shippável, TDD)

1. **Sentry frontend** — maior valor imediato: crashes de UI hoje invisíveis.
2. **Sentry edge functions** — erros de webhook/checkout/IA com alerta.
3. **Aba Saúde no Admin** — visão de negócio agregada.

## 11. Riscos e mitigações

- **Quota free tier (5k eventos/mês)**: tracing off, replay off, dedupe/agrupamento nativos;
  se estourar, o Sentry degrada (dropa eventos), não cobra sozinho.
- **Ruído de erros esperados** (rede do usuário, abort de navegação): `beforeSend`/`ignoreErrors`
  com lista curta e conservadora, refinada com uso real.
- **Bundle**: `@sentry/react` adiciona ~30 KB gzip; aceitável para o valor; sem replay o
  módulo pesado nem entra.
- **Cobertura 100%**: estratégia da §8; nenhum threshold é reduzido.
