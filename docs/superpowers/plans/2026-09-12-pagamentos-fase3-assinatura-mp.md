# Pagamentos, Fase 3: assinatura mensal via Mercado Pago para usuário logado (Implementation Plan)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um usuário **logado** assina um plano mensal com cartão (Card Payment Brick → `POST
/preapproval` do MP), o balde do plano é carregado na hora (ativação otimista) e renovado pelo
webhook a cada cobrança mensal aprovada; a 1ª parcela recusada faz clawback; o usuário cancela e
troca o cartão pelo próprio app. Nada anônimo ainda (o funil da LP é a Fase 4): `/assinar` exige
sessão e, sem ela, redireciona para `/auth`.

**Spec:** `docs/superpowers/specs/2026-09-11-pagamentos-assinatura-mp-design.md` (4.1 `plans`,
`subscriptions`, `subscription_invoices`; 4.2 RPCs de assinatura; 4.3 B, C, D, E; 4.4; 4.5
`CreditsPage` "Sua assinatura"; 9 achados sobre 1ª parcela, idempotência por transição, pending,
`already_subscribed`, `exempt_user`, cartão salvo, `statement_descriptor`).

**Architecture:** `plans` é a fonte única (seed em migration, leitura pública filtrada). O fluxo de
assinatura vive em `_shared/subscribeFlow.ts` como `runSubscribe(input, deps)` com dependências
injetadas (padrão `credits.ts`/`adminAuth.ts`), 100% testado; `subscribe/index.ts` só monta `deps`.
Estado do MP é espelhado em `subscriptions` pelo webhook (`mp-webhook` ganha roteamento por tópico
em `_shared/mpWebhookRouter.ts`), e `subscription_invoices` guarda cada `authorized_payment` como
espelho com status: o crédito entra só na transição `granted_at IS NULL → now()` com pagamento
aprovado, então `recycling → approved` credita uma vez e um replay nunca credita duas. Dinheiro em
SQL: `activate_subscription`, `renew_subscription`, `clawback_subscription`,
`mark_subscription_past_due`, `cancel_subscription_local`, todas com `FOR UPDATE` no perfil.

**Tech Stack:** Postgres/RLS/pgTAP; Deno; React 18 + TanStack Query; `@mercadopago/sdk-react`
(Brick já embrulhado em `MpCardBrick`); Vitest 100%.

## Global Constraints

- TDD, cobertura 100%, `index.ts` sem regra, RPCs `CREATE OR REPLACE` + `REVOKE/GRANT`, colunas
  novas de `profiles` no guard, `supabase migration up` + `make gen-types` por migration.
- **MP**: `POST /preapproval` sem `statement_descriptor` (não existe lá); `X-Idempotency-Key`
  enviado mas **nunca** repetir o POST às cegas (em erro de rede, `GET /preapproval/search?
  external_reference=`); `payer_email` = e-mail da conta; token do Brick é de uso único.
- **Sem deploy.** Local com `make fn-serve-mp-test` (vendedor de teste); o webhook de assinatura
  não chega no local: os testes de webhook são unitários + pgTAP.
- Estado ao final: usuário logado assina, vê "Sua assinatura", cancela e troca cartão; anônimo em
  `/assinar` vai para `/auth`.

---

### Task 1: Schema: `plans`, `subscriptions`, `subscription_invoices`, colunas em `profiles`

**Files:** `supabase/migrations/20260914000000_subscriptions_schema.sql`,
`supabase/tests/database/plans_rls.test.sql`, `subscriptions_rls.test.sql`,
`credit_paywall_guard.test.sql` (+`plan_period_start`)

```sql
CREATE TABLE public.plans (
  id uuid PK, slug text UNIQUE, name text, price_brl numeric(10,2), monthly_credits integer,
  highlight boolean, sort_order integer, active boolean, admin_only boolean, created_at, updated_at);
-- RLS: anon vê active AND NOT admin_only; authenticated idem OU super-admin (duas policies,
-- padrão credit_packages); GRANT SELECT; REVOKE escritas de anon/authenticated.
-- Seed: basico 19.90/60, profissional 59.90/240 (highlight), avancado 99.90/500,
--       teste-admin 1.00/1 (admin_only). ON CONFLICT (slug) DO NOTHING.

CREATE TABLE public.subscriptions (
  id uuid PK (= external_reference), user_id uuid FK, plan_id uuid FK plans,
  mp_preapproval_id text UNIQUE, status text CHECK IN ('pending','authorized','past_due','paused','cancelled','rejected'),
  mp_status text, next_payment_date timestamptz, current_period_start timestamptz, current_period_end timestamptz,
  first_payment_confirmed boolean DEFAULT false, payer_email text, card_brand text, card_last_four text,
  status_detail text, attribution jsonb, cancel_requested_at, cancelled_at, created_at, updated_at);
CREATE UNIQUE INDEX subscriptions_one_live_per_user ON subscriptions(user_id)
  WHERE status IN ('authorized','past_due','paused');
-- RLS: dono SELECT; GRANT SELECT authenticated; escrita só service_role.

CREATE TABLE public.subscription_invoices (
  id text PK (authorized_payment id do MP; 'activation:<sub id>' para a ativação),
  subscription_id uuid FK, mp_payment_id text, status text, payment_status text,
  amount_brl numeric, debit_date timestamptz, retry_attempt integer, granted_at timestamptz, raw jsonb, created_at, updated_at);
-- RLS: dono via EXISTS em subscriptions; escrita só service_role.

ALTER TABLE profiles ADD COLUMN plan_period_start timestamptz;  -- entra no guard
```

- [x] RED (pgTAP: RLS das 3 tabelas, seed dos planos, índice único parcial, guard) → GREEN → commit
  `feat(assinatura): schema de planos, assinaturas e faturas`.

---

### Task 2: RPCs de assinatura

**Files:** `supabase/migrations/20260914000001_subscription_rpcs.sql`,
`supabase/tests/database/subscription_rpcs.test.sql`

```sql
activate_subscription(p_subscription_id, p_mp_preapproval_id, p_mp_status, p_next_payment_date, p_card_brand, p_card_last_four) → jsonb
  -- FOR UPDATE perfil; subscriptions.status='authorized', mp_*; period_start=now(), period_end=coalesce(next_payment_date, now()+1 month);
  -- profiles: access_kind='subscriber', plan_credits=monthly_credits (reset, ledger plan_reset do que sobrou + plan_grant), plan_period_start/end;
  -- invoice sintético 'activation:<id>' com granted_at=now(); idempotente (já authorized → no-op {already:true}).
renew_subscription(p_subscription_id, p_invoice jsonb) → jsonb
  -- p_invoice: {id, mp_payment_id, status, payment_status, amount_brl, debit_date, retry_attempt, raw}
  -- UPSERT em subscription_invoices (espelho). Se payment_status='approved' E granted_at IS NULL:
  --   se NOT first_payment_confirmed → marca confirmed, granted_at=now(), sem reset ({result:'first_payment_confirmed'});
  --   senão se debit_date >= current_period_end - 1 day → reset+grant, period_start=debit_date, period_end=debit_date+1 month,
  --        status 'authorized', granted_at=now() ({result:'renewed'});
  --   senão granted_at=now(), sem reset ({result:'same_period'}).
  -- Se payment_status rejeitado/recycling: se NOT first_payment_confirmed → clawback_subscription; senão mark_subscription_past_due.
clawback_subscription(p_subscription_id) → plan_credits=0, plan_period_end=now(), ledger clawback (delta negativo), status 'rejected'.
mark_subscription_past_due(p_subscription_id) → status 'past_due' (só de authorized).
cancel_subscription_local(p_subscription_id, p_cancelled_at) → status 'cancelled', cancelled_at; créditos ficam até period_end.
sync_subscription_status(p_subscription_id, p_mp_status, p_next_payment_date) → espelha authorized/paused/cancelled do tópico subscription_preapproval;
  -- pending→authorized chama activate_subscription.
-- Todas REVOKE/GRANT service_role.
```

- [x] RED (ativação com reset do trial; 1ª parcela confirma sem reset; renovação reseta; mesmo id
  `recycling` depois `approved` credita uma vez; replay não credita; 1ª parcela recusada → clawback;
  renovação recusada → past_due sem tocar saldo; cancel mantém créditos; ACL) → GREEN → commit
  `feat(assinatura): ativar, renovar, estornar e cancelar a assinatura no banco`.

---

### Task 3: builders puros do MP e roteador do webhook

**Files:** `_shared/mpPreapproval.ts` (+test), `_shared/mpSubscriptionEvents.ts` (+test),
`_shared/mpWebhookRouter.ts` (+test), `_shared/mpEvents.ts` (UUID guard, +test)

```ts
buildPreapprovalBody({ plan, subscriptionId, payerEmail, cardToken, backUrl }) →
  { reason: `Assinatura ${plan.name} - Olhar Singular`, external_reference, payer_email, card_token_id,
    auto_recurring: { frequency: 1, frequency_type: "months", transaction_amount, currency_id: "BRL" },
    back_url, status: "authorized" }
interpretPreapproval(resp) → { status: "authorized" | "pending" | "rejected", preapprovalId, mpStatus, nextPaymentDate, cardBrand, statusDetail }
parseSubscriptionNotification(body, query) → { topic: "payment" | "subscription_preapproval" | "subscription_authorized_payment" | null, id }
interpretAuthorizedPayment(ap) → invoice jsonb para renew_subscription (payment_status só 'approved' conta como pago; 'processed' sem approved NÃO)
mpEvents.extractApprovedGrant/RejectedPurchase: external_reference precisa ser UUID; senão null.
```

- [x] RED → GREEN → commit `feat(assinatura): montar o preapproval e interpretar os eventos de assinatura`.

---

### Task 4: `subscribeFlow.ts` + edge `subscribe` (logado)

**Files:** `_shared/subscribeFlow.ts` (+test), `_shared/subscribeInput.ts` (+test),
`supabase/functions/subscribe/index.ts`

```ts
runSubscribe(input: { userId, email, planSlug, card, cardLastFour?, attribution? }, deps: {
  loadPlan(slug), loadProfile(userId), findLiveSubscription(userId), expireStalePending(userId),
  insertSubscription(row), postPreapproval(body, idempotencyKey) → { ok, status, json },
  searchPreapprovalByRef(id), activate(...), reject(id, detail), logInfo }) → SubscribeResult
// 409 already_subscribed; 409 exempt_user; 400 invalid_plan (admin_only sem super-admin); 400 invalid_card;
// authorized → activate; pending → status pending (webhook ativa); erro/recusa → rejected + status_detail; nunca repete POST.
```
`index.ts`: auth obrigatória (Bearer válido), `parseSubscribeInput`, monta deps com o client
service_role, `APP_URL` como `back_url` (`/creditos`).

- [x] RED → GREEN → `denoImportGraph` → commit `feat(assinatura): assinar um plano com cartão pelo app`.

---

### Task 5: webhook com tópicos + cancelar + trocar cartão

**Files:** `mp-webhook/index.ts` (usa `mpWebhookRouter`), `cancel-subscription/index.ts` +
`_shared/cancelSubscriptionFlow.ts` (+test), `update-subscription-card/index.ts` +
`_shared/updateCardFlow.ts` (+test), `config.toml` (nada: autenticadas)

- `subscription_preapproval` → `GET /preapproval/{id}` → `sync_subscription_status` (casa por
  `mp_preapproval_id` OU `external_reference`).
- `subscription_authorized_payment` → `GET /authorized_payments/{id}` → `renew_subscription`.
- `cancel-subscription`: assinatura viva do `auth.uid()` → `PUT /preapproval/{id} {status:'cancelled'}`
  → `cancel_subscription_local`. Body `userId` só com `authorizeSuperAdmin`.
- `update-subscription-card`: `PUT /preapproval/{id} {card_token_id}` → espelha `card_brand`/last4.

- [x] RED → GREEN → commit `feat(assinatura): webhook de assinatura, cancelamento e troca de cartão`.

---

### Task 6: cliente

**Files:** `src/hooks/usePlans.ts` (+test; queryKey `["plans"]`), `src/hooks/useSubscription.ts`
(+test; `["subscription", userId]`, assinatura mais recente do dono; `useSubscribe`,
`useCancelSubscription`, `useUpdateSubscriptionCard` invalidam `["subscription"]`,
`refreshProfile()`, `["credit_transactions"]`), `src/pages/SubscribePage.tsx` (+test; rota
`/assinar?plano=`, protegida nesta fase; seletor com Profissional pré-selecionado; aviso "você
ainda tem N créditos até dd/mm; ao assinar agora eles serão substituídos"; Brick; estados
authorized/pending/rejected; `exempt` e `already_subscribed` com CTA para `/creditos`),
`src/components/credits/SubscriptionCard.tsx` (+test; plano, status, próxima cobrança, cartão,
cancelar com confirmação, trocar cartão com Brick, "vale até dd/mm" quando cancelada, CTA assinar),
`CreditsPage` (seção "Sua assinatura" no topo), `AccessBanner` (+`past_due`, `pending`,
`rejected`), `computeAccess` (+`subscriptionStatus` opcional), `App.tsx` (rota `/assinar` dentro
do `ProtectedRoute` + `Layout`), `PricingSection` (cards de plano lendo `usePlans`, botão
"Assinar" → `/assinar?plano=<slug>`; extras citados), `Layout` (item "Assinar" no menu quando
não assinante).

- [x] RED → GREEN por arquivo → commit `feat(assinatura): assinar, acompanhar, cancelar e trocar o cartão pelo app` (843ee10).

---

### Task 7: docs vivas + validação

- [x] `dominio-orientador` (fluxo Assinatura na tabela; gotchas: 1ª parcela, transição da fatura,
  `processed` não é pago, uma viva por usuário), `edge-fn-writer` (árvore), `.env.example`
  (`APP_URL`), `Makefile` nada novo.
- [x] `make lint`, `npx vitest run`, `npm run test:coverage`, `make test-db`, `make fn-check` (11 erros pré-existentes, nenhum em assinatura).
- [x] Commit `docs(skills): assinatura mensal via Mercado Pago`.
