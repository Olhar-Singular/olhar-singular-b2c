# Trial com cartão, rodada 2: estorno em autoatendimento, Admin e extensão de teste

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** quem foi cobrado e não queria pede o estorno da **última cobrança** sozinho, em Créditos
(devolve integral no cartão, zera os créditos do plano, cancela a assinatura, extras ficam); o Admin
distingue "Teste (cartão)" de "Teste (convite)" e mostra a última cobrança/estorno; e o admin não
consegue "estender" um teste com cartão (o MP não adia a cobrança do dia 8).

**Architecture:** duas RPCs `service_role` (`refund_last_charge` acha a cobrança elegível e trava a
assinatura; `confirm_refund` grava `refunded_at`/`mp_refund_id`, zera o balde do plano com ledger
`refund_clawback` e cancela localmente) em volta de uma edge function nova `refund-last-charge`
(`index.ts` = glue; decisões em `_shared/refundFlow.ts`, DI + Vitest) que chama
`POST /v1/payments/{id}/refunds` com `X-Idempotency-Key = refund:<invoice_id>` e cancela o
preapproval no MP (best effort). Cliente: `useLastCharge` + `useRefundLastCharge`, botão e diálogo
no `SubscriptionCard`, rótulo no extrato, Política de Reembolso e FAQ reescritas. Admin:
`admin-dashboard` devolve `trial_ends_at`/`first_payment_confirmed`/`last_charge`; estados
`trial_card`/`trial`; `admin_extend_trial` devolve `card_trial`.

**Tech Stack:** Postgres/plpgsql + pgTAP · Deno edge functions (`_shared/` puro) · React 18 +
TanStack Query + Vitest/Testing Library · Mercado Pago (`/v1/payments/{id}/refunds`, `/preapproval`).

**Spec:** `docs/superpowers/specs/2026-09-15-trial-com-cartao-e-estorno-design.md` (seções 4, 5, 6,
7, 8, 9, 10, 11; decisão 5; rodada 2 na seção 12).

## Global Constraints

- **Commits locais por task, sem push** (push = deploy pelo CI). Mensagens em pt-BR, Conventional
  Commits (`feat(creditos)`, `feat(admin)`, `docs(legal)`, ...). Trabalho na `main`.
- **TDD** em toda task; **gate de cobertura 100%** (nunca baixar); dinheiro/RLS em **pgTAP**.
- `CREATE OR REPLACE` nas RPCs existentes (mesma assinatura); função nova = `REVOKE EXECUTE ... FROM
  PUBLIC, anon, authenticated` + `GRANT ... TO service_role`. Nunca `make sb-reset` (negado): aplicar
  migration nova com `supabase migration up` (local); tipos por `make gen-types` (arquivo gerado,
  nunca à mão).
- **Estorno só da última cobrança aprovada com `mp_payment_id`**, nunca da invoice sintética
  `activation:`, nunca duas vezes (`refunded_at`). Elegível: assinatura viva
  (`authorized|past_due|paused`) ou a mais recente `cancelled` com `cancelled_at > now() - 30 dias`.
- **Ordem no estorno:** RPC acha → `POST refund` (não-2xx ⇒ 502 **sem escrita**) → `PUT preapproval
  cancelled` (best effort, log) → `confirm_refund`. `X-Idempotency-Key = "refund:" + invoice.id`.
- Contratos JSON em camelCase: resposta `{ amountBrl, refundedAt, subscriptionId }`; erros `{ error,
  code }` com `nothing_to_refund` (409) e `provider_error` (502).
- **Teste com cartão não se estende**: `admin_extend_trial` ⇒ `{ success:false, error:'card_trial' }`.
- pt-BR sem travessão (—); código/comentários em inglês; guarda de copy (`grátis` só com teste/testar).
- Analytics: evento `refund` (já existe em `AnalyticsEventName`) com `valueBrl` = valor estornado.
- Testes no container: `docker compose exec app npx vitest run <paths>`; pgTAP: `make test-db`;
  Deno: `make fn-check` (8 erros pré-existentes conhecidos no núcleo do Adaptar; nada mais).

---

## Mapa de arquivos

| Arquivo | Responsabilidade |
| --- | --- |
| `supabase/migrations/20260920000000_refund_last_charge.sql` (novo) | colunas `refunded_at`/`mp_refund_id`, tipo `refund_clawback`, RPCs `refund_last_charge`/`confirm_refund`, `admin_extend_trial` com `card_trial` |
| `supabase/tests/database/refund_last_charge.test.sql` (novo) | pgTAP das regras acima |
| `supabase/functions/_shared/refundFlow.ts` (+ test) (novo) | `runRefundLastCharge(input, deps)` |
| `supabase/functions/_shared/refundDeps.ts` (+ test) (novo) | `buildRefundDeps(admin, mpAccessToken, fetch, now)` |
| `supabase/functions/refund-last-charge/index.ts` (novo) | glue HTTP (JWT do próprio usuário) |
| `supabase/functions/_shared/adminDashboard.ts` (+ test), `supabase/functions/admin-dashboard/index.ts` | `trial_ends_at`, `first_payment_confirmed`, `last_charge` por assinatura |
| `src/hooks/useSubscription.ts` (+ test) | `LastChargeView`, `useLastCharge`, `useRefundLastCharge`, `SubscriptionView` inalterado |
| `src/lib/domain/subscriptionUi.ts` | `canRefundLastCharge(sub, lastCharge, now)` |
| `src/components/credits/SubscriptionCard.tsx` (+ test) | botão "Pedir estorno da última cobrança", diálogo, linha "Estorno solicitado" |
| `src/pages/CreditsPage.tsx` (+ test) | rótulo `refund_clawback` |
| `src/lib/domain/legalDocs.ts`, `src/components/landing/FaqSection.tsx` (+ tests) | Política de Reembolso e FAQ do estorno |
| `src/types/admin.ts`, `src/lib/utils/adminAccess.ts` (+ test), `src/components/admin/UsersTable.tsx` (+ test), `src/components/admin/AccessMenu.tsx` (+ test), `src/hooks/useAdminDashboard.ts` | estados `trial_card`/`trial`, coluna última cobrança, "Estender" desabilitado, mensagem `card_trial` |
| `.claude/skills/dominio-orientador/SKILL.md`, `.claude/agents/edge-fn-writer.md`, spec | doc viva |

---

### Task 1: migration + RPCs de estorno + `card_trial` + pgTAP

**Files:**
- Create: `supabase/migrations/20260920000000_refund_last_charge.sql`
- Create: `supabase/tests/database/refund_last_charge.test.sql`
- Regenerate: `src/integrations/supabase/types.ts` (`make gen-types`)

**Interfaces:**
- Consumes: `cancel_subscription_local(uuid, timestamptz)`, `activate_subscription`, `renew_subscription` (migrations `20260918000000/1`), `admin_extend_trial(uuid, integer)` (migration `20260913000002`).
- Produces: `subscription_invoices.refunded_at timestamptz`, `subscription_invoices.mp_refund_id text`; `credit_transactions.type` aceita `refund_clawback`; `refund_last_charge(p_user_id uuid) → jsonb` = `{ success:true, invoice_id, mp_payment_id, amount_brl, subscription_id, mp_preapproval_id }` ou `{ success:false, error:'nothing_to_refund' }`; `confirm_refund(p_invoice_id text, p_mp_refund_id text) → jsonb` = `{ success:true, already:false, subscription_id, credits_removed }` / `{ success:true, already:true }` / `{ success:false, error:'invoice_not_found' }`; `admin_extend_trial` devolve `{ success:false, error:'card_trial' }` para trial com cartão vivo e não confirmado.

- [ ] **Step 1: pgTAP (falha)**

`supabase/tests/database/refund_last_charge.test.sql`:

```sql
-- =============================================================================
-- pgTAP: self-service refund of the last charge + no extension of a card trial
-- -----------------------------------------------------------------------------
-- refund_last_charge finds the newest approved invoice with an MP payment id
-- that was not refunded yet, for the user's live subscription or the most
-- recent one cancelled less than 30 days ago; it never touches money (the edge
-- function talks to MP first). confirm_refund records the refund exactly once,
-- zeroes the plan bucket (ledger refund_clawback, extras untouched) and cancels
-- the subscription locally. admin_extend_trial refuses a card trial: MP does
-- not move the day-8 charge.
-- =============================================================================
BEGIN;
SELECT plan(24);

INSERT INTO auth.users (id, email) VALUES
  ('e1111111-1111-1111-1111-111111111111', 'payer@test.com'),
  ('e2222222-2222-2222-2222-222222222222', 'trial-only@test.com'),
  ('e3333333-3333-3333-3333-333333333333', 'cancelled-recent@test.com'),
  ('e4444444-4444-4444-4444-444444444444', 'cancelled-old@test.com'),
  ('e5555555-5555-5555-5555-555555555555', 'card-trial@test.com');

-- Paid subscriber with two approved charges (and the synthetic activation row).
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000001', 'e1111111-1111-1111-1111-111111111111', id, 'authorized', 'payer@test.com', true, 'pre-1'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscription_invoices (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, granted_at)
VALUES ('activation:f0000000-0000-0000-0000-000000000001', 'f0000000-0000-0000-0000-000000000001', NULL, 'activation', 'approved', NULL, NULL, now() - interval '40 days'),
       ('ap-old', 'f0000000-0000-0000-0000-000000000001', 'pay-old', 'processed', 'approved', 39.90, now() - interval '35 days', now() - interval '35 days'),
       ('ap-new', 'f0000000-0000-0000-0000-000000000001', 'pay-new', 'processed', 'approved', 39.90, now() - interval '5 days', now() - interval '5 days'),
       ('ap-pending', 'f0000000-0000-0000-0000-000000000001', NULL, 'scheduled', 'pending', 39.90, now() + interval '25 days', NULL);
UPDATE public.profiles SET access_kind = 'subscriber', plan_credits = 210, credit_balance = 30, plan_period_end = now() + interval '25 days'
 WHERE id = 'e1111111-1111-1111-1111-111111111111';

-- Trial with card, no money yet: nothing to refund.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000002', 'e2222222-2222-2222-2222-222222222222', id, 'authorized', 'trial-only@test.com', now() + interval '5 days', 'pre-2'
  FROM public.plans WHERE slug = 'basico';
UPDATE public.profiles SET access_kind = 'trial', plan_credits = 50, plan_period_end = now() + interval '5 days', trial_started_at = now() - interval '2 days'
 WHERE id = 'e2222222-2222-2222-2222-222222222222';

-- Cancelled 10 days ago with a paid charge: still refundable.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed, cancelled_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000003', 'e3333333-3333-3333-3333-333333333333', id, 'cancelled', 'cancelled-recent@test.com', true, now() - interval '10 days', 'pre-3'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscription_invoices (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, granted_at)
VALUES ('ap-3', 'f0000000-0000-0000-0000-000000000003', 'pay-3', 'processed', 'approved', 39.90, now() - interval '12 days', now() - interval '12 days');

-- Cancelled 40 days ago: window closed.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, first_payment_confirmed, cancelled_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000004', 'e4444444-4444-4444-4444-444444444444', id, 'cancelled', 'cancelled-old@test.com', true, now() - interval '40 days', 'pre-4'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscription_invoices (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, granted_at)
VALUES ('ap-4', 'f0000000-0000-0000-0000-000000000004', 'pay-4', 'processed', 'approved', 39.90, now() - interval '42 days', now() - interval '42 days');

-- Card trial for admin_extend_trial.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at, mp_preapproval_id)
SELECT 'f0000000-0000-0000-0000-000000000005', 'e5555555-5555-5555-5555-555555555555', id, 'authorized', 'card-trial@test.com', now() + interval '6 days', 'pre-5'
  FROM public.plans WHERE slug = 'basico';
UPDATE public.profiles SET access_kind = 'trial', plan_credits = 50, plan_period_end = now() + interval '6 days', trial_started_at = now() - interval '1 day'
 WHERE id = 'e5555555-5555-5555-5555-555555555555';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Schema ──────────────────────────────────────────────────────────────────
SELECT has_column('public', 'subscription_invoices', 'refunded_at', 'subscription_invoices.refunded_at exists');
SELECT has_column('public', 'subscription_invoices', 'mp_refund_id', 'subscription_invoices.mp_refund_id exists');

-- ── refund_last_charge: finds the newest approved charge with money ─────────
CREATE TEMP TABLE found AS
  SELECT public.refund_last_charge('e1111111-1111-1111-1111-111111111111'::uuid) AS res;
SELECT is((SELECT res->>'success' FROM found), 'true', 'find: succeeds for a live subscriber');
SELECT results_eq(
  $$ SELECT res->>'invoice_id', res->>'mp_payment_id', (res->>'amount_brl')::numeric, res->>'subscription_id', res->>'mp_preapproval_id' FROM found $$,
  $$ VALUES ('ap-new'::text, 'pay-new'::text, 39.90::numeric, 'f0000000-0000-0000-0000-000000000001'::text, 'pre-1'::text) $$,
  'find: the newest approved invoice with an MP payment id (never the activation row, never a pending one)');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'e1111111-1111-1111-1111-111111111111'),
  210, 'find: touches no money');

SELECT is(
  (SELECT public.refund_last_charge('e2222222-2222-2222-2222-222222222222'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: a card trial without a charge has nothing to refund');
SELECT is(
  (SELECT public.refund_last_charge('e3333333-3333-3333-3333-333333333333'::uuid) ->> 'invoice_id'),
  'ap-3', 'find: a subscription cancelled less than 30 days ago is still refundable');
SELECT is(
  (SELECT public.refund_last_charge('e4444444-4444-4444-4444-444444444444'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: cancelled more than 30 days ago is out of the window');
SELECT is(
  (SELECT public.refund_last_charge('e5555555-5555-5555-5555-555555555555'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: unknown or chargeless user has nothing to refund');

-- ── confirm_refund: once, zeroes the plan bucket, keeps extras, cancels ─────
CREATE TEMP TABLE conf AS
  SELECT public.confirm_refund('ap-new', 'refund-1') AS res;
SELECT is((SELECT res->>'success' FROM conf), 'true', 'confirm: succeeds');
SELECT is((SELECT res->>'already' FROM conf), 'false', 'confirm: first confirmation');
SELECT is((SELECT (res->>'credits_removed')::int FROM conf), 210, 'confirm: reports the plan credits removed');
SELECT results_eq(
  $$ SELECT refunded_at IS NOT NULL, mp_refund_id FROM public.subscription_invoices WHERE id = 'ap-new' $$,
  $$ VALUES (true, 'refund-1'::text) $$,
  'confirm: the invoice records the refund');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, credit_balance, plan_period_end <= now()
       FROM public.profiles WHERE id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 0, 30, true) $$,
  'confirm: plan bucket zeroed and closed, extras untouched');
SELECT results_eq(
  $$ SELECT type, bucket, delta, ref_id FROM public.credit_transactions
      WHERE user_id = 'e1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('refund_clawback'::text, 'plan'::text, -210, 'f0000000-0000-0000-0000-000000000001'::uuid) $$,
  'confirm: one refund_clawback ledger line');
SELECT results_eq(
  $$ SELECT status, cancelled_at IS NOT NULL FROM public.subscriptions WHERE id = 'f0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('cancelled'::text, true) $$,
  'confirm: the subscription is cancelled locally');

-- Replay: nothing happens twice.
SELECT is(
  (SELECT (public.confirm_refund('ap-new', 'refund-1') ->> 'already')::boolean),
  true, 'confirm: a replay is a no-op');
SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions WHERE user_id = 'e1111111-1111-1111-1111-111111111111'),
  1, 'confirm: the replay wrote no ledger line');
SELECT is(
  (SELECT public.refund_last_charge('e1111111-1111-1111-1111-111111111111'::uuid) ->> 'error'),
  'nothing_to_refund', 'find: after the refund, the older charge is NOT offered (last charge only)');
SELECT is(
  (SELECT public.confirm_refund('does-not-exist', 'r') ->> 'error'),
  'invoice_not_found', 'confirm: unknown invoice');

-- An already-cancelled subscription: confirm keeps it cancelled and still zeroes the bucket.
UPDATE public.profiles SET plan_credits = 100, plan_period_end = now() + interval '10 days' WHERE id = 'e3333333-3333-3333-3333-333333333333';
SELECT is((SELECT public.confirm_refund('ap-3', 'refund-3') ->> 'success'), 'true', 'confirm: works on a cancelled subscription');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'e3333333-3333-3333-3333-333333333333'),
  0, 'confirm: the leftover of a cancelled period is removed too');

-- ── admin_extend_trial refuses a card trial ─────────────────────────────────
SELECT is(
  (SELECT public.admin_extend_trial('e5555555-5555-5555-5555-555555555555'::uuid, 7) ->> 'error'),
  'card_trial', 'extend: a trial with card cannot be extended (MP charges on day 8 regardless)');
SELECT ok(
  (SELECT plan_period_end < now() + interval '7 days' FROM public.profiles WHERE id = 'e5555555-5555-5555-5555-555555555555'),
  'extend: the period was not moved');

-- ── ACL ─────────────────────────────────────────────────────────────────────
RESET role;
SELECT ok(NOT has_function_privilege('authenticated', 'public.refund_last_charge(uuid)', 'EXECUTE'), 'acl: authenticated cannot call refund_last_charge');
SELECT ok(NOT has_function_privilege('authenticated', 'public.confirm_refund(text, text)', 'EXECUTE'), 'acl: authenticated cannot call confirm_refund');

SELECT * FROM finish();
ROLLBACK;
```

(Conferir a contagem: 24 asserções. Ajustar `plan(N)` se precisar.)

- [ ] **Step 2: rodar e ver falhar** — `make test-db` (o arquivo novo falha na coluna/função inexistente; os outros verdes).

- [ ] **Step 3: migration**

```sql
-- =============================================================================
-- Self-service refund of the last charge + card trials cannot be extended
-- -----------------------------------------------------------------------------
-- refund_last_charge only FINDS the eligible charge (newest approved invoice
-- with an MP payment id, not refunded, of the live subscription or the most
-- recent one cancelled < 30 days ago) and locks the subscription row: the edge
-- function talks to Mercado Pago first. confirm_refund then records the refund
-- exactly once (refunded_at), zeroes the plan bucket with a refund_clawback
-- ledger line (extras untouched) and cancels the subscription locally.
-- admin_extend_trial refuses a card trial: MP ignores changes to start_date
-- (sandbox 2026-09-18) and charges on day 8 regardless.
-- Covered by refund_last_charge.test.sql.
-- =============================================================================

ALTER TABLE public.subscription_invoices
  ADD COLUMN IF NOT EXISTS refunded_at  timestamptz,
  ADD COLUMN IF NOT EXISTS mp_refund_id text;

ALTER TABLE public.credit_transactions
  DROP CONSTRAINT IF EXISTS credit_transactions_type_check;
ALTER TABLE public.credit_transactions
  ADD CONSTRAINT credit_transactions_type_check
  CHECK (type IN (
    'signup_bonus', 'purchase', 'adapt', 'regenerate', 'chat', 'refund', 'extract',
    'admin_grant', 'trial_grant', 'plan_grant', 'plan_reset', 'compensation', 'clawback',
    'refund_clawback'
  ));

CREATE OR REPLACE FUNCTION public.refund_last_charge(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub     record;
  v_invoice record;
BEGIN
  -- The live subscription wins; otherwise the most recent one cancelled
  -- less than 30 days ago (the refund window after cancelling).
  SELECT id, mp_preapproval_id
    INTO v_sub
    FROM public.subscriptions
   WHERE user_id = p_user_id
     AND (status IN ('authorized', 'past_due', 'paused')
          OR (status = 'cancelled' AND cancelled_at > now() - interval '30 days'))
   ORDER BY (status IN ('authorized', 'past_due', 'paused')) DESC, created_at DESC
   LIMIT 1
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_refund');
  END IF;

  -- Only real money: an approved invoice with an MP payment id (never the
  -- synthetic activation row), not refunded yet. Last charge only.
  SELECT id, mp_payment_id, amount_brl
    INTO v_invoice
    FROM public.subscription_invoices
   WHERE subscription_id = v_sub.id
     AND payment_status = 'approved'
     AND mp_payment_id IS NOT NULL
     AND refunded_at IS NULL
   ORDER BY debit_date DESC NULLS LAST, created_at DESC
   LIMIT 1;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'nothing_to_refund');
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'invoice_id', v_invoice.id,
    'mp_payment_id', v_invoice.mp_payment_id,
    'amount_brl', v_invoice.amount_brl,
    'subscription_id', v_sub.id,
    'mp_preapproval_id', v_sub.mp_preapproval_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.confirm_refund(p_invoice_id text, p_mp_refund_id text)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_invoice record;
  v_user    uuid;
  v_left    integer;
BEGIN
  SELECT id, subscription_id, refunded_at
    INTO v_invoice
    FROM public.subscription_invoices
   WHERE id = p_invoice_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'invoice_not_found');
  END IF;
  IF v_invoice.refunded_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', true, 'already', true, 'subscription_id', v_invoice.subscription_id);
  END IF;

  UPDATE public.subscription_invoices
     SET refunded_at = now(), mp_refund_id = p_mp_refund_id
   WHERE id = p_invoice_id;

  SELECT user_id INTO v_user FROM public.subscriptions WHERE id = v_invoice.subscription_id FOR UPDATE;

  -- The money went back: the plan credits of that charge go too (extras stay).
  SELECT plan_credits INTO v_left FROM public.profiles WHERE id = v_user FOR UPDATE;
  UPDATE public.profiles SET plan_credits = 0, plan_period_end = now() WHERE id = v_user;
  IF v_left > 0 THEN
    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (v_user, -v_left, 'refund_clawback', v_invoice.subscription_id, 'plan');
  END IF;

  -- Already cancelled → not_cancellable, which is fine here.
  PERFORM public.cancel_subscription_local(v_invoice.subscription_id, now());

  RETURN jsonb_build_object(
    'success', true, 'already', false,
    'subscription_id', v_invoice.subscription_id,
    'credits_removed', COALESCE(v_left, 0));
END;
$$;

-- admin_extend_trial: a card trial cannot be extended (same signature).
CREATE OR REPLACE FUNCTION public.admin_extend_trial(
  p_user_id uuid,
  p_days    integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_profile record;
  v_new_end timestamptz;
BEGIN
  IF p_days IS NULL OR p_days <= 0 THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_days');
  END IF;

  SELECT access_kind, plan_period_end, trial_started_at
    INTO v_profile
    FROM public.profiles
   WHERE id = p_user_id
     FOR UPDATE;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'user_not_found');
  END IF;
  IF v_profile.access_kind <> 'trial' OR v_profile.trial_started_at IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_a_trial');
  END IF;

  -- Mercado Pago charges on the trial's start_date no matter what we store
  -- here: extending would only postpone the paywall while the card is charged.
  IF EXISTS (
    SELECT 1 FROM public.subscriptions s
     WHERE s.user_id = p_user_id
       AND s.status IN ('authorized', 'past_due', 'paused')
       AND s.trial_ends_at IS NOT NULL
       AND NOT s.first_payment_confirmed
  ) THEN
    RETURN jsonb_build_object('success', false, 'error', 'card_trial');
  END IF;

  -- An expired trial restarts from now; a running one is pushed further out.
  v_new_end := GREATEST(now(), COALESCE(v_profile.plan_period_end, now()))
               + make_interval(days => p_days);

  IF v_new_end > v_profile.trial_started_at + interval '90 days' THEN
    RETURN jsonb_build_object('success', false, 'error', 'trial_limit_reached');
  END IF;

  UPDATE public.profiles SET plan_period_end = v_new_end WHERE id = p_user_id;

  RETURN jsonb_build_object('success', true, 'plan_period_end', v_new_end);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.refund_last_charge(uuid)      FROM PUBLIC, anon, authenticated;
REVOKE EXECUTE ON FUNCTION public.confirm_refund(text, text)     FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.refund_last_charge(uuid)      TO service_role;
GRANT  EXECUTE ON FUNCTION public.confirm_refund(text, text)     TO service_role;
```

- [ ] **Step 4:** `supabase migration up` → `make test-db` (novo arquivo verde; `trial_and_access.test.sql`, `subscription_rpcs.test.sql` etc. continuam verdes).
- [ ] **Step 5:** `make gen-types`; conferir `refunded_at`/`mp_refund_id` em `types.ts` e as duas RPCs novas.
- [ ] **Step 6: commit** — `feat(creditos): RPCs de estorno da última cobrança e bloqueio de extensão de teste com cartão`.

---

### Task 2: `_shared/refundFlow.ts` + `_shared/refundDeps.ts` + `refund-last-charge/index.ts`

**Files:**
- Create: `supabase/functions/_shared/refundFlow.ts`, `refundFlow.test.ts`
- Create: `supabase/functions/_shared/refundDeps.ts`, `refundDeps.test.ts` (padrão de `subscriptionActionDeps.ts`/`.test.ts`)
- Create: `supabase/functions/refund-last-charge/index.ts` (padrão de `cancel-subscription/index.ts`, sem `userId` de admin)

**Interfaces:**
- Consumes: RPCs da Task 1; `mpRequest` (`_shared/mpHttp.ts`, aceita `idempotencyKey`); `cancelPreapprovalAtMp`; `AnalyticsEventName` `"refund"`.
- Produces:

```ts
export interface RefundableCharge {
  invoiceId: string;
  mpPaymentId: string;
  amountBrl: number;
  subscriptionId: string;
  mpPreapprovalId: string | null;
}

export interface RefundDeps {
  /** RPC refund_last_charge: the eligible charge or null (nothing_to_refund). */
  findRefundable(userId: string): Promise<RefundableCharge | null>;
  /** POST /v1/payments/{id}/refunds with X-Idempotency-Key; returns MP's refund id when 2xx. */
  postRefund(mpPaymentId: string, idempotencyKey: string): Promise<{ ok: boolean; status: number; refundId: string | null; message: string | null }>;
  /** PUT /preapproval/{id} { status: 'cancelled' }; best effort, never throws. */
  cancelPreapproval(preapprovalId: string): Promise<boolean>;
  /** RPC confirm_refund. */
  confirmRefund(invoiceId: string, mpRefundId: string): Promise<{ success?: boolean; already?: boolean; error?: string; credits_removed?: number } | null>;
  now(): Date;
  log(message: string, ...args: unknown[]): void;
}

export type RefundResult =
  | { ok: true; amountBrl: number; refundedAt: string; subscriptionId: string; invoiceId: string; creditsRemoved: number }
  | { ok: false; error: "nothing_to_refund" | "provider_error"; httpStatus: number };

export async function runRefundLastCharge(input: { userId: string }, deps: RefundDeps): Promise<RefundResult>
```

Regras (testes em `refundFlow.test.ts`, DI com `vi.fn`): (1) `findRefundable` null ⇒ `nothing_to_refund` 409, nada mais chamado; (2) `postRefund` não-2xx ⇒ `provider_error` 502, `confirmRefund` NÃO chamado, `cancelPreapproval` NÃO chamado, log com status/mensagem; (3) 2xx ⇒ `cancelPreapproval(mpPreapprovalId)` (pulado se null; `false` só loga) ⇒ `confirmRefund(invoiceId, refundId)` ⇒ `{ ok:true, amountBrl, refundedAt: deps.now().toISOString(), subscriptionId, invoiceId, creditsRemoved }`; (4) chave de idempotência `refund:<invoiceId>`; (5) `confirmRefund` `already:true` ⇒ ainda `ok:true` (replay depois de uma confirmação que falhou antes) com `creditsRemoved: 0`; (6) `postRefund` 2xx sem `refundId` ⇒ usa `"unknown"` e loga (o MP às vezes responde 201 sem corpo); (7) `confirmRefund` lança ⇒ propaga (500 no glue; o replay repete o POST com a mesma chave).

`refundDeps.ts` (`buildRefundDeps(admin, mpAccessToken, fetchFn = fetch, now = () => new Date())`): `findRefundable` chama `admin.rpc("refund_last_charge", { p_user_id })` (erro ⇒ throw; `success:false` ⇒ null); `postRefund` = `mpRequest(\`/v1/payments/${encodeURIComponent(id)}/refunds\`, { method:"POST", token, body:{}, idempotencyKey }, fetchFn)` → `{ ok, status, refundId: json.id != null ? String(json.id) : null, message: typeof json.message === "string" ? json.message : null }`; `cancelPreapproval` = `cancelPreapprovalAtMp(id, token, fetchFn)`; `confirmRefund` = `admin.rpc("confirm_refund", { p_invoice_id, p_mp_refund_id })` (erro ⇒ throw). Testes pinam nomes de RPC/params e o path do MP (como `subscriptionActionDeps.test.ts`).

`index.ts`: CORS + JWT do usuário (401), `runRefundLastCharge({ userId: user.id }, buildRefundDeps(admin, mpAccessToken))`, erros `{ error, code }` com `ERRORS = { nothing_to_refund: "Não há cobrança para estornar.", provider_error: "Não foi possível estornar agora. Tente de novo em alguns minutos." }`, analytics `{ name:"refund", eventId: \`${invoiceId}:refund\`, userId, valueBrl: amountBrl, params: { subscription_id } }`, resposta `{ amountBrl, refundedAt, subscriptionId }`. Não registrar em `admin_actions` (é do próprio usuário). Verificar que `supabase/functions/denoImportGraph.test.ts` passa (imports `.ts` explícitos). `make fn-check` verde.

- [ ] Steps: testes RED → implementação → GREEN (`docker compose exec app npx vitest run supabase/functions/_shared/refundFlow.test.ts supabase/functions/_shared/refundDeps.test.ts supabase/functions/denoImportGraph.test.ts`) → `make fn-check` → commit `feat(creditos): edge function refund-last-charge com fluxo puro e idempotente`.

---

### Task 3: cliente: `useLastCharge`, `useRefundLastCharge`, `canRefundLastCharge`

**Files:**
- Modify: `src/hooks/useSubscription.ts` (+ `useSubscription.test.ts`)
- Modify: `src/lib/domain/subscriptionUi.ts` (testes no `SubscriptionCard.test.tsx`, bloco de helpers)

**Produces:**

```ts
export interface LastChargeView { id: string; amountBrl: number | null; debitDate: Date | null; refundedAt: Date | null; }
export function toLastChargeView(row: { id: string; amount_brl: number | string | null; debit_date: string | null; refunded_at: string | null }): LastChargeView
/** The newest approved charge with money of a subscription (owner RLS); null when none. */
export function useLastCharge(subscriptionId: string | null | undefined)  // queryKey ["last_charge", subscriptionId], enabled: !!subscriptionId, staleTime 30s
export function useRefundLastCharge()  // invoke "refund-last-charge" {} ; onSuccess: refreshProfile + invalidate ["subscription"], ["credit_transactions"], ["last_charge"]; toast.success(`Estorno de ${formatBrl(amountBrl)} solicitado. Ele aparece no cartão em até duas faturas.`); onError toast via parseEdgeFnError (fallback "Não foi possível estornar agora. Tente de novo em alguns minutos.")
```

`useLastCharge` query: `.from("subscription_invoices").select("id, amount_brl, debit_date, refunded_at").eq("subscription_id", id).eq("payment_status", "approved").not("mp_payment_id", "is", null).order("debit_date", { ascending: false, nullsFirst: false }).limit(1).maybeSingle()`.

`subscriptionUi.ts`:

```ts
export const REFUND_WINDOW_DAYS = 30;
// Decision 5: the last approved charge can always be refunded by the user,
// while the subscription is live or up to 30 days after cancelling it.
export function canRefundLastCharge(sub: SubscriptionView | null | undefined, lastCharge: LastChargeView | null | undefined, now: Date): boolean {
  if (!sub || !lastCharge || lastCharge.refundedAt) return false;
  if (LIVE_STATUSES.includes(sub.status)) return true;
  return sub.status === "cancelled" && !!sub.cancelledAt && now.getTime() - sub.cancelledAt.getTime() < REFUND_WINDOW_DAYS * 24 * 60 * 60 * 1000;
}
```

Testes: `toLastChargeView` (string numeric → number, nulls), `useLastCharge` (query chain via `createQueryChain`, enabled false sem id), `useRefundLastCharge` (invoke + invalidations + toasts), `canRefundLastCharge` (viva; cancelada há 10 dias; há 40 dias; já estornada; sem cobrança).

- [ ] Steps: RED → GREEN → commit `feat(creditos): hooks de última cobrança e estorno`.

---

### Task 4: `SubscriptionCard` (botão e diálogo de estorno) + rótulo no extrato

**Files:**
- Modify: `src/components/credits/SubscriptionCard.tsx` (+ test), `src/pages/CreditsPage.tsx` (+ test)

Regras:
- O card chama `useLastCharge(subscription?.id)` e `useRefundLastCharge()` (hooks incondicionais, acima dos early returns).
- Em qualquer ramo (viva ou cancelada) onde `canRefundLastCharge(subscription, lastCharge, now)`: botão `variant="ghost"` "Pedir estorno da última cobrança" → `AlertDialog` título "Estornar a última cobrança?" e descrição: `Devolvemos ${formatBrl(lastCharge.amountBrl)} no mesmo cartão (pode levar até duas faturas), os ${access.planCredits} créditos restantes do plano são removidos e a assinatura é cancelada. Os créditos extras ficam.` Ações "Manter" / "Pedir estorno" (`refund.mutate()`, `disabled={refund.isPending}`).
- Quando `lastCharge?.refundedAt`: linha `Estorno de ${formatBrl(amountBrl)} solicitado em ${formatDate(refundedAt)}.` (sem botão).
- Testes (mocks de `useLastCharge`/`useRefundLastCharge` no `vi.mock` de `@/hooks/useSubscription`, no padrão do arquivo): botão aparece na viva com cobrança; some quando `refundedAt`; some no trial com cartão sem cobrança; aparece na cancelada há 10 dias; diálogo com o texto exato e `mockRefund` chamado; linha "Estorno de R$ 39,90 solicitado em dd/mm/yyyy".
- `CreditsPage.tsx`: `refund_clawback: "Créditos removidos pelo estorno"` no mapa de rótulos (+ teste que renderiza uma transação desse tipo).

- [ ] Steps: RED → GREEN (`src/components/credits`, `src/pages/CreditsPage.test.tsx`, `src/test/copyGuard.test.ts`) → commit `feat(creditos): estorno da última cobrança em autoatendimento no card da assinatura`.

---

### Task 5: Política de Reembolso e FAQ

**Files:**
- Modify: `src/lib/domain/legalDocs.ts` (+ `src/pages/LegalPage.test.tsx`), `src/components/landing/FaqSection.tsx` (+ test)

`reembolso` (remover `SUPPORT_EMAIL` do arquivo se sobrar só na Privacidade: manter o import se a Privacidade ainda o usa):

```ts
  reembolso: {
    title: "Política de Reembolso",
    intro: "Regras para arrependimento, cancelamento e cobranças indevidas.",
    sections: [
      {
        title: "1. Estorno da última cobrança",
        paragraphs: [
          "Você pode pedir o estorno integral da última cobrança da assinatura a qualquer momento, em Créditos, com um clique, enquanto a assinatura estiver ativa ou em até 30 dias após cancelá-la. Vale mesmo que parte dos créditos daquele mês já tenha sido usada.",
          "Ao estornar, os créditos restantes do plano daquele mês são removidos e a assinatura é cancelada. Os créditos extras avulsos ficam com você. Cobranças anteriores à última não são estornadas.",
        ],
      },
      {
        title: "2. Créditos extras avulsos",
        paragraphs: [
          "Em até 7 dias corridos após a compra de créditos extras, você pode pedir reembolso integral, desde que os créditos não tenham sido usados.",
        ],
      },
      {
        title: "3. Como funciona",
        paragraphs: [
          "O estorno é feito pelo Mercado Pago no mesmo cartão e pode levar até duas faturas para aparecer. Uma cobrança simbólica de validação do cartão, quando existe, é estornada automaticamente pela operadora.",
        ],
      },
    ],
  },
```

FAQ "E se eu me arrepender?": `"Em Créditos você pede o estorno integral da última cobrança com um clique, a qualquer momento enquanto a assinatura estiver ativa (ou até 30 dias depois de cancelar). Os créditos restantes do plano daquele mês são removidos, os extras ficam, e a assinatura é cancelada. O dinheiro volta no mesmo cartão em até duas faturas."`

Testes: `LegalPage.test.tsx` (títulos das 3 seções, sem e-mail no documento de reembolso: `expect(JSON.stringify(LEGAL_DOCS.reembolso)).not.toMatch(/@/)`), `FaqSection.test.tsx` (abrir a pergunta e ler "estorno integral da última cobrança").

- [ ] Steps: RED → GREEN → commit `docs(legal): Política de Reembolso e FAQ descrevem o estorno em autoatendimento`.

---

### Task 6: Admin: `admin-dashboard` devolve trial com cartão e última cobrança

**Files:**
- Modify: `supabase/functions/_shared/adminDashboard.ts` (+ test), `supabase/functions/admin-dashboard/index.ts`

**Produces:** `SubscriptionLite` ganha `trial_ends_at?`, `first_payment_confirmed?`, `id`; `AdminSubscriptionRow` ganha `trial_ends_at: string | null`, `first_payment_confirmed: boolean`, `last_charge: { amount_brl: number; debit_date: string | null; refunded_at: string | null } | null`; `mergeUserRows(..., subscriptions, invoices)` com `InvoiceLite { subscription_id; amount_brl; debit_date; refunded_at }` (só aprovadas com `mp_payment_id`, a mais recente por assinatura via `pickLastChargePerSubscription`). `index.ts`: select de `subscriptions` ganha `id, trial_ends_at, first_payment_confirmed`; nova query `subscription_invoices` `select("subscription_id, amount_brl, debit_date, refunded_at").eq("payment_status","approved").not("mp_payment_id","is",null)`.

Testes em `adminDashboard.test.ts`: `pickLastChargePerSubscription` (mais recente por `debit_date`), `mergeUserRows` com invoices (last_charge presente/ausente; `trial_ends_at` e `first_payment_confirmed` propagados; defaults `null`/`false`).

- [ ] Steps: RED → GREEN → `make fn-check` → commit `feat(admin): dashboard expõe teste com cartão e última cobrança por assinatura`.

---

### Task 7: Admin UI: estados Teste (cartão)/Teste (convite), coluna última cobrança, "Estender" bloqueado

**Files:**
- Modify: `src/types/admin.ts`, `src/lib/utils/adminAccess.ts` (+ `adminAccess.test.ts`), `src/components/admin/UsersTable.tsx` (+ test), `src/components/admin/AccessMenu.tsx` (+ test), `src/hooks/useAdminDashboard.ts`

Regras:
- `AdminSubscription` ganha `trial_ends_at: string | null`, `first_payment_confirmed: boolean`, `last_charge: { amount_brl: number; debit_date: string | null; refunded_at: string | null } | null`.
- `adminAccess.ts`: `AdminAccessState` ganha `"trial_card"`; `ACCESS_STATE_LABELS`: `trial_card: "Teste (cartão)"`, `trial: "Teste (convite)"`; `isCardTrialUser(user)` = `!!user.subscription && ["authorized","past_due","paused"].includes(user.subscription.status) && !!user.subscription.trial_ends_at && !user.subscription.first_payment_confirmed`; em `adminAccessState`, `kind === "trial" && active && isCardTrialUser(user)` ⇒ `"trial_card"`. `formatLastCharge(user)` ⇒ `"R$ 39,90 em dd/MM/yyyy"` + `" · estornada em dd/MM/yyyy"` quando `refunded_at`; null sem cobrança.
- `UsersTable.tsx`: `STATE_BADGE.trial_card` (mesma variante de `trial`); o filtro lista o estado novo automaticamente (`Object.keys(ACCESS_STATE_LABELS)`); na célula da assinatura, linha extra `<span className="block text-xs">{formatLastCharge(user)}</span>` quando existir (`data-testid` `last-charge-<id>`).
- `AccessMenu.tsx`: os itens "+N dias" ficam `disabled` quando `isCardTrialUser(user)`, com um `DropdownMenuLabel`/texto "Teste com cartão: a cobrança do 8º dia é fixa no Mercado Pago. Conceda créditos extras ou cancele o teste."
- `useAdminDashboard.ts`: `ADMIN_ERRORS.card_trial = "Teste com cartão: a cobrança do 8º dia é fixa no Mercado Pago e não pode ser adiada. Conceda créditos extras ou cancele o teste."`.
- Testes: `adminAccess.test.ts` (`trial_card` vs `trial`, `formatLastCharge` 3 casos), `UsersTable.test.tsx` (badge "Teste (cartão)", filtro por ele, linha da última cobrança com "estornada"), `AccessMenu.test.tsx` (itens de estender desabilitados para trial com cartão, habilitados para convite), fixtures ganham os campos novos.

- [ ] Steps: RED → GREEN (`src/lib/utils`, `src/components/admin`, `src/hooks/useAdminDashboard.test.ts`, copy guard) → commit `feat(admin): Teste (cartão) x Teste (convite), última cobrança e extensão bloqueada`.

---

### Task 8: doc viva + gates

- `.claude/skills/dominio-orientador/SKILL.md`: linha "Créditos"/"Assinatura" da tabela ganha `refund-last-charge`; gotcha novo "**Estorno em autoatendimento (2026-09-18).**" (RPCs, ordem MP → cancel → confirm, idempotência `refund:<invoice_id>`, `refund_clawback`, janela de 30 dias, `useLastCharge`/`useRefundLastCharge`/`canRefundLastCharge`, Admin `trial_card`, `admin_extend_trial` ⇒ `card_trial` porque o MP ignora `start_date` no PUT); `.claude/agents/edge-fn-writer.md`: `refund-last-charge` na lista de modelos e `refundFlow.ts`/`refundDeps.ts` na árvore. Spec seção 12: "Rodada 2 implementada em <data>".
- Gates: `make lint`, `docker compose exec app npm run test:coverage` (100%), `make typecheck-app` (advisory; grep dos arquivos tocados), `make fn-check`, `make test-db`.
- Commit `docs: doc viva da rodada 2 (estorno e admin)`.

---

### Task 9 (manual, com o dono): validação em 22/09 e deploy

1. 22/09: `GET /authorized_payments/search?preapproval_id=48cada46fb9a4cc79862003c314cff8a` (token STAGING); anotar `status`/`payment` do dia 8 na seção 13 do spec.
2. Com o `payment.id` dessa cobrança: `POST /v1/payments/{id}/refunds` com `X-Idempotency-Key` (curl, STAGING) para validar o endpoint e a idempotência do replay; depois cancelar o preapproval.
3. Se o passo 2 passar: `git push origin main` (Supabase Deploy + CI + Vercel); smoke em produção: `refund-last-charge` sem JWT ⇒ 401; com JWT de conta sem cobrança ⇒ 409 `nothing_to_refund`.

## Self-review

Cobertura do spec: §4 (colunas, tipo; índice dispensado com justificativa) Task 1; §5 (`refund_last_charge`, `confirm_refund`) Task 1; §6 (`refund-last-charge`, ordem, 502 sem escrita, idempotência, `refund`) Task 2; §7 (`SubscriptionCard` estorno, extrato, `useRefundLastCharge`) Tasks 3-4; §8 (Reembolso; Privacidade fica) Task 5; §9 (Admin, extensão) Tasks 1, 6, 7; §10 (JWT, só a própria assinatura, `FOR UPDATE`, chave de idempotência) Tasks 1-2; §11 (pgTAP `refund`, Vitest `refundFlow`, `SubscriptionCard`, `useRefundLastCharge`, `legalDocs`) Tasks 1-5. Sem placeholders. Nomes consistentes: `refund_last_charge`/`confirm_refund` (SQL) ↔ `findRefundable`/`confirmRefund` (deps) ↔ `useRefundLastCharge` (hook); `last_charge` (admin JSON) ↔ `LastChargeView` (cliente).
