# Teste grátis com cartão (7 dias): plano de implementação

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** o card "Teste" da landing deixa de pedir convite por e-mail e passa a criar, sozinho, uma
assinatura no Mercado Pago com cartão obrigatório e **sem cobrança por 7 dias** (50 créditos); no 8º
dia o MP cobra o plano mais barato (R$ 39,90 / 300 créditos) e a conta vira assinante comum.

**Architecture:** a linha de `subscriptions` carrega a intenção (`trial_ends_at` gravado no INSERT
da tentativa); `POST /preapproval` recebe `auto_recurring.start_date = hoje + 7 dias` (validado em
sandbox em 2026-09-15: volta `authorized`, `next_payment_date = start_date`, zero cobrança); as RPCs
existentes (`activate_subscription`, `renew_subscription`, `cancel_subscription_local`) ramificam pela
coluna sem mudar de assinatura. O `subscribe` (público) ganha `trial: true` só no funil anônimo, com
uma barreira por CPF (`trial_used_by_cpf`). O front expõe o trial na landing, em `/assinar?trial=1`,
no card "Sua assinatura", na faixa de acesso e nos Termos.

**Tech Stack:** Postgres (plpgsql, pgTAP) · Deno edge functions (`_shared/` puro + `index.ts` glue)
· React 18 + TanStack Query + Vitest/Testing Library · Mercado Pago Assinaturas (`/preapproval`)
e Card Payment Brick.

**Spec:** `docs/superpowers/specs/2026-09-15-trial-com-cartao-e-estorno-design.md` (rodada 1,
seção 12: só o teste com cartão; estorno em autoatendimento e Admin ficam para a rodada 2).

## Global Constraints

- **Nunca commit automático.** Cada task termina propondo a mensagem de commit e **aguardando a
  aprovação explícita do dono** (regra do `CLAUDE.md`; convenção na skill `commit-crafting`).
  Trabalho direto na `main`, sem branch.
- **Push = deploy.** `.github/workflows/supabase.yml` aplica migrations e publica functions a cada
  push na `main` que toque `supabase/**`. Nenhum push sem o dono (spec, seção 12, fase 4).
- **TDD** em toda task: teste falhando → implementação mínima → verde. **Gate de cobertura 100%**
  (Vitest) e pgTAP para tudo que mexe em dinheiro/RLS. Nunca baixar o threshold.
- **`CREATE OR REPLACE`** nas RPCs, mesmas assinaturas (nunca `DROP` + `CREATE`: reabre o EXECUTE
  para PUBLIC). Função nova = `REVOKE ... FROM PUBLIC, anon, authenticated` + `GRANT ... TO service_role`.
- **`reason` do preapproval ≤ 60 caracteres** (o MP devolve 400 acima disso). Texto do trial:
  `Teste 7 dias + ${plan.name} - Olhar Singular`, sempre cortado em 60.
- **`src/integrations/supabase/types.ts` e `src/components/ui/*` são gerados: NÃO editar.** A
  coluna nova entra nos tipos por `make gen-types`.
- **pt-BR sem travessão (`—`)**: vírgula, dois-pontos ou parênteses. Código e comentários em inglês.
- **Guarda de copy** (`src/test/copyGuard.test.ts`): "grátis" só pode aparecer numa linha que também
  tenha "teste"/"testar"; "nunca expiram", "gratuit*" e "Stripe" continuam proibidos.
- Analytics: nada de e-mail/CPF no `dataLayer`; eventos tipados em `src/lib/analytics/events.ts` e
  `_shared/analyticsEvents.ts`.
- Comandos rodam no container via `make` (app container: `make up` se estiver `down`; Supabase local
  já está `up`). Teste único: `docker compose exec app npx vitest run <caminho>`.

---

## Mapa de arquivos

| Arquivo | Responsabilidade nesta feature |
| --- | --- |
| `supabase/migrations/20260918000000_trial_with_card.sql` (novo) | coluna `subscriptions.trial_ends_at`, índice parcial `profiles(cpf)`, RPC `trial_used_by_cpf`, ramificação de trial em `activate_subscription` / `renew_subscription` / `cancel_subscription_local` |
| `supabase/tests/database/trial_with_card.test.sql` (novo) | pgTAP das regras acima |
| `supabase/functions/_shared/mpPreapproval.ts` | `TRIAL_DAYS`, `trialEndDate`, `startDate` no body, `reason` ≤ 60 |
| `supabase/functions/_shared/subscribeInput.ts` | `trial` no contrato |
| `supabase/functions/_shared/subscribeFlow.ts` | plano mais barato, `trial_ends_at` no insert, `start_date`, `planSlug`/`priceBrl`/`trialEndsAt` no resultado |
| `supabase/functions/_shared/accountProvision.ts` | `trial_requires_new_account`, `cpf_required`, `trial_used` |
| `supabase/functions/_shared/analyticsEvents.ts` | evento `trial_started` |
| `supabase/functions/subscribe/index.ts` | glue: deps novas, mensagens, resposta com `trialEndsAt` |
| `supabase/functions/mp-webhook/index.ts` | `trial_converted` conta como `subscription_renewed` |
| `src/lib/utils/errors.ts` | `parseInvokeFailure` (mensagem + `code`) |
| `src/hooks/useSubscription.ts` | `trial`, `trialEndsAt`, `code` no erro, `useCancelSubscription({ trial })`, `SubscriptionView.trialEndsAt` |
| `src/lib/analytics/events.ts` | `trackTrialStarted` |
| `src/lib/domain/subscriptionUi.ts` | `TRIAL_DAYS`, `TRIAL_CREDITS`, `cheapestPublicPlan`, `trialFirstChargeDate`, `isCardTrial`, `TERMS_VERSION` |
| `src/components/payments/MpCardBrick.tsx` | prop `submitLabel` (texto do botão do Brick) |
| `src/components/landing/PricingSection.tsx`, `FaqSection.tsx` | card "Teste grátis", FAQ |
| `src/test/copyGuard.test.ts` | "grátis" permitido só junto de "teste" |
| `src/pages/SubscribePage.tsx` | modo `?trial=1` |
| `src/components/credits/SubscriptionCard.tsx`, `src/components/common/AccessBanner.tsx` | estado "trial com cartão" |
| `src/lib/domain/legalDocs.ts` | cláusula "Teste grátis" nos Termos |
| `.claude/skills/dominio-orientador/SKILL.md`, `.claude/agents/edge-fn-writer.md`, `.env.example`, `.claude/docs/environment.md` | documentação viva |

---

### Task 1: migration + RPCs do trial + pgTAP

**Files:**
- Create: `supabase/migrations/20260918000000_trial_with_card.sql`
- Create: `supabase/tests/database/trial_with_card.test.sql`
- Regenerate: `src/integrations/supabase/types.ts` (via `make gen-types`, nunca à mão)

**Interfaces:**
- Consumes: `apply_plan_quota`, `clawback_subscription`, `mark_subscription_past_due` (migration `20260914000001`), versões atuais de `activate_subscription` (`20260915000001`), `renew_subscription` (`20260916000002`) e `cancel_subscription_local` (`20260914000001`).
- Produces: coluna `subscriptions.trial_ends_at timestamptz NULL`; `trial_used_by_cpf(p_cpf text) → boolean` (service_role); `activate_subscription` devolve `{ success, already:false, trial:true, plan_credits:50, plan_period_end }` para linha com `trial_ends_at`; `renew_subscription` devolve `result: 'trial_converted'` na 1ª cobrança aprovada de um trial; `cancel_subscription_local` devolve `{ success, trial_closed:true, credits_removed }` ao cancelar dentro do trial.

- [ ] **Step 1: escrever o teste pgTAP (falha: coluna e função não existem)**

`supabase/tests/database/trial_with_card.test.sql`:

```sql
-- =============================================================================
-- pgTAP: trial with card (7 days, first charge on day 8)
-- -----------------------------------------------------------------------------
-- The subscribe function writes subscriptions.trial_ends_at on the pending row
-- (the start_date sent to Mercado Pago). activate_subscription branches on it:
-- 50 trial credits in the plan bucket until the trial ends, account kind
-- 'trial', no plan quota and no activation invoice. The first charge (day 8)
-- is the first money: renew_subscription converts the trial into the paid
-- plan (quota, subscriber). Cancelling inside the trial removes the trial
-- credits at once (decision 3); cancelling a paid period keeps them (lazy
-- expiry). One trial per CPF (decision 4): trial_used_by_cpf.
-- =============================================================================
BEGIN;
SELECT plan(33);

INSERT INTO auth.users (id, email) VALUES
  ('c1111111-1111-1111-1111-111111111111', 'card-trial@test.com'),
  ('c2222222-2222-2222-2222-222222222222', 'trial-cancel@test.com'),
  ('c3333333-3333-3333-3333-333333333333', 'trial-declined@test.com'),
  ('c4444444-4444-4444-4444-444444444444', 'paid@test.com'),
  ('c5555555-5555-5555-5555-555555555555', 'never@test.com');

-- Trial rows carry the intent from the INSERT: trial_ends_at = the start_date sent to MP.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'd0000000-0000-0000-0000-000000000001', 'c1111111-1111-1111-1111-111111111111', id, 'pending',
       'card-trial@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'd0000000-0000-0000-0000-000000000002', 'c2222222-2222-2222-2222-222222222222', id, 'pending',
       'trial-cancel@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email, trial_ends_at)
SELECT 'd0000000-0000-0000-0000-000000000003', 'c3333333-3333-3333-3333-333333333333', id, 'pending',
       'trial-declined@test.com', now() + interval '7 days'
  FROM public.plans WHERE slug = 'basico';
-- Paid control row: no trial_ends_at.
INSERT INTO public.subscriptions (id, user_id, plan_id, status, payer_email)
SELECT 'd0000000-0000-0000-0000-000000000004', 'c4444444-4444-4444-4444-444444444444', id, 'pending',
       'paid@test.com'
  FROM public.plans WHERE slug = 'basico';

SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);
SET LOCAL role service_role;

-- ── Schema ──────────────────────────────────────────────────────────────────
SELECT has_column('public', 'subscriptions', 'trial_ends_at', 'subscriptions.trial_ends_at exists');

-- ── Activation of a trial ───────────────────────────────────────────────────
CREATE TEMP TABLE act AS
  SELECT public.activate_subscription(
    'd0000000-0000-0000-0000-000000000001'::uuid, 'pre-t1', 'authorized',
    now() + interval '7 days', 'visa', '5682') AS res;

SELECT is((SELECT res->>'success' FROM act), 'true', 'trial activate: succeeds');
SELECT is((SELECT res->>'trial' FROM act), 'true', 'trial activate: reports the trial');
SELECT is((SELECT (res->>'plan_credits')::int FROM act), 50, 'trial activate: reports the 50 credits');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, credit_balance, trial_started_at IS NOT NULL,
            plan_period_start IS NOT NULL,
            plan_period_end = (SELECT trial_ends_at FROM public.subscriptions
                                WHERE id = 'd0000000-0000-0000-0000-000000000001')
       FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('trial'::text, 50, 0, true, true, true) $$,
  'trial activate: 50 trial credits in the plan bucket until trial_ends_at, account kind trial');
SELECT results_eq(
  $$ SELECT status, first_payment_confirmed, mp_preapproval_id, card_brand, card_last_four,
            current_period_end = trial_ends_at
       FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES ('authorized'::text, false, 'pre-t1'::text, 'visa'::text, '5682'::text, true) $$,
  'trial activate: the row is live, its period ends with the trial, first charge still to come');
SELECT results_eq(
  $$ SELECT type, bucket, delta, ref_id FROM public.credit_transactions
      WHERE user_id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('trial_grant'::text, 'plan'::text, 50, 'd0000000-0000-0000-0000-000000000001'::uuid) $$,
  'trial activate: one trial_grant, no plan_grant');
SELECT is(
  (SELECT count(*)::int FROM public.subscription_invoices
     WHERE subscription_id = 'd0000000-0000-0000-0000-000000000001'),
  0, 'trial activate: no activation invoice (nothing was granted against money)');

-- Idempotent: activating again changes nothing.
SELECT is(
  (SELECT (public.activate_subscription(
     'd0000000-0000-0000-0000-000000000001'::uuid, 'pre-t1', 'authorized',
     now() + interval '7 days', 'visa', '5682') ->> 'already')::boolean),
  true, 'trial activate: a second call is a no-op');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111'),
  50, 'trial activate: the replay did not grant again');

-- ── Day 8: the first charge converts the trial into the paid plan ───────────
UPDATE public.profiles SET plan_credits = 30 WHERE id = 'c1111111-1111-1111-1111-111111111111';  -- 20 spent

CREATE TEMP TABLE conv AS
  SELECT public.renew_subscription(
    'd0000000-0000-0000-0000-000000000001'::uuid,
    jsonb_build_object(
      'id', 'ap-t1', 'mp_payment_id', 'pay-t1', 'status', 'processed', 'payment_status', 'approved',
      'amount_brl', 39.90, 'debit_date', (now() + interval '7 days')::text, 'retry_attempt', 0,
      'raw', '{}'::jsonb)) AS res;

SELECT is((SELECT res->>'result' FROM conv), 'trial_converted', 'first charge: converts the trial');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end > now() + interval '34 days'
       FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111' $$,
  $$ VALUES ('subscriber'::text, 300, true) $$,
  'first charge: subscriber with the plan quota and a new period');
SELECT results_eq(
  $$ SELECT first_payment_confirmed, status, current_period_end > now() + interval '34 days',
            next_payment_date = current_period_end
       FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000001' $$,
  $$ VALUES (true, 'authorized'::text, true, true) $$,
  'first charge: confirmed, period opened from the debit date');
SELECT results_eq(
  $$ SELECT type, delta FROM public.credit_transactions
      WHERE user_id = 'c1111111-1111-1111-1111-111111111111' AND type IN ('plan_reset', 'plan_grant')
      ORDER BY delta $$,
  $$ VALUES ('plan_reset'::text, -30), ('plan_grant', 300) $$,
  'first charge: the leftover trial credits are closed and the quota granted');
SELECT is(
  (SELECT granted_at IS NOT NULL FROM public.subscription_invoices WHERE id = 'ap-t1'),
  true, 'first charge: the invoice is mirrored and claimed');
SELECT is(
  (SELECT public.renew_subscription(
     'd0000000-0000-0000-0000-000000000001'::uuid,
     jsonb_build_object('id', 'ap-t1', 'mp_payment_id', 'pay-t1', 'status', 'processed',
                        'payment_status', 'approved', 'amount_brl', 39.90,
                        'debit_date', (now() + interval '7 days')::text)) ->> 'result'),
  'already_processed', 'first charge: a replay grants nothing');
SELECT is(
  (SELECT plan_credits FROM public.profiles WHERE id = 'c1111111-1111-1111-1111-111111111111'),
  300, 'first charge: the replay left the quota alone');

-- ── Cancelling inside the trial: paywall now, nothing charged ───────────────
SELECT public.activate_subscription(
  'd0000000-0000-0000-0000-000000000002'::uuid, 'pre-t2', 'authorized',
  now() + interval '7 days', 'visa', '5682');
UPDATE public.profiles SET plan_credits = 44 WHERE id = 'c2222222-2222-2222-2222-222222222222';  -- 6 spent

CREATE TEMP TABLE canc AS
  SELECT public.cancel_subscription_local('d0000000-0000-0000-0000-000000000002'::uuid, now()) AS res;

SELECT is((SELECT res->>'trial_closed' FROM canc), 'true', 'trial cancel: reports the trial closed');
SELECT is((SELECT (res->>'credits_removed')::int FROM canc), 44, 'trial cancel: reports what was removed');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end <= now()
       FROM public.profiles WHERE id = 'c2222222-2222-2222-2222-222222222222' $$,
  $$ VALUES ('trial'::text, 0, true) $$,
  'trial cancel: the trial credits are gone at once and the period is closed');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000002'),
  'cancelled', 'trial cancel: the row is cancelled');
SELECT results_eq(
  $$ SELECT type, delta FROM public.credit_transactions
      WHERE user_id = 'c2222222-2222-2222-2222-222222222222' ORDER BY delta $$,
  $$ VALUES ('plan_reset'::text, -44), ('trial_grant', 50) $$,
  'trial cancel: the ledger shows the removal');

-- ── Cancelling a paid subscription keeps the period (regression) ────────────
SELECT public.activate_subscription(
  'd0000000-0000-0000-0000-000000000004'::uuid, 'pre-p4', 'authorized',
  now() + interval '1 month', 'master', '1234');
SELECT public.cancel_subscription_local('d0000000-0000-0000-0000-000000000004'::uuid, now());
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end > now() + interval '29 days'
       FROM public.profiles WHERE id = 'c4444444-4444-4444-4444-444444444444' $$,
  $$ VALUES ('subscriber'::text, 300, true) $$,
  'paid cancel: the credits of the paid period stay (lazy expiry)');

-- ── Declined first charge of a trial: clawback ──────────────────────────────
SELECT public.activate_subscription(
  'd0000000-0000-0000-0000-000000000003'::uuid, 'pre-t3', 'authorized',
  now() + interval '7 days', 'visa', '5682');
SELECT is(
  (SELECT public.renew_subscription(
     'd0000000-0000-0000-0000-000000000003'::uuid,
     jsonb_build_object('id', 'ap-t3', 'mp_payment_id', 'pay-t3', 'status', 'processed',
                        'payment_status', 'rejected', 'amount_brl', 39.90,
                        'debit_date', (now() + interval '7 days')::text)) ->> 'result'),
  'clawback', 'declined first charge: clawback');
SELECT results_eq(
  $$ SELECT access_kind, plan_credits, plan_period_end <= now()
       FROM public.profiles WHERE id = 'c3333333-3333-3333-3333-333333333333' $$,
  $$ VALUES ('trial'::text, 0, true) $$,
  'declined first charge: the trial credits are removed');
SELECT is(
  (SELECT status FROM public.subscriptions WHERE id = 'd0000000-0000-0000-0000-000000000003'),
  'rejected', 'declined first charge: the subscription is rejected');

-- ── One trial per CPF ───────────────────────────────────────────────────────
UPDATE public.profiles SET cpf = '11111111111' WHERE id = 'c1111111-1111-1111-1111-111111111111';
UPDATE public.profiles SET cpf = '44444444444' WHERE id = 'c4444444-4444-4444-4444-444444444444';
UPDATE public.profiles SET cpf = '55555555555' WHERE id = 'c5555555-5555-5555-5555-555555555555';

SELECT is(public.trial_used_by_cpf('11111111111'), true,  'cpf: a CPF that had the trial is used');
SELECT is(public.trial_used_by_cpf('44444444444'), true,  'cpf: a CPF with a subscription (no trial) is used');
SELECT is(public.trial_used_by_cpf('55555555555'), false, 'cpf: a CPF with neither is free');
SELECT is(public.trial_used_by_cpf('99999999999'), false, 'cpf: an unknown CPF is free');

-- ── ACL ─────────────────────────────────────────────────────────────────────
RESET role;
SELECT ok(NOT has_function_privilege('anon', 'public.trial_used_by_cpf(text)', 'EXECUTE'),
  'acl: anon cannot call trial_used_by_cpf');
SELECT ok(NOT has_function_privilege('authenticated', 'public.trial_used_by_cpf(text)', 'EXECUTE'),
  'acl: authenticated cannot call trial_used_by_cpf');
SELECT ok(has_function_privilege('service_role', 'public.trial_used_by_cpf(text)', 'EXECUTE'),
  'acl: service_role can call trial_used_by_cpf');

SELECT * FROM finish();
ROLLBACK;
```

- [ ] **Step 2: rodar e ver falhar**

Run: `make test-db`
Expected: `trial_with_card.test.sql` falha já no INSERT (`column "trial_ends_at" ... does not exist`); os outros arquivos continuam verdes.

- [ ] **Step 3: escrever a migration**

`supabase/migrations/20260918000000_trial_with_card.sql`:

```sql
-- =============================================================================
-- Trial with card: 7 days free, first charge on day 8
-- -----------------------------------------------------------------------------
-- The landing no longer asks for an invite: the card creates a Mercado Pago
-- preapproval with auto_recurring.start_date = now + 7 days (validated in the
-- sandbox on 2026-09-15: authorized, next_payment_date = start_date, no charge).
--
-- The ROW carries the intent: the subscribe function writes
-- subscriptions.trial_ends_at on the pending row, and the RPCs below branch on
-- it with their signatures unchanged (CREATE OR REPLACE keeps the
-- service_role-only ACL; a new DEFAULT parameter would have created an
-- ambiguous overload). The webhook path (sync_subscription_status →
-- activate_subscription) therefore activates a trial left pending correctly.
--
-- Activation of a trial: 50 credits in the plan bucket until trial_ends_at,
-- access_kind 'trial', no plan quota, no activation invoice (nothing was
-- granted against money). The first approved charge (day 8) converts the trial:
-- apply_plan_quota closes what is left of the 50 and loads the quota
-- ('subscriber'). A declined first charge is the existing clawback. Cancelling
-- inside the trial removes the trial credits at once (decision 3); a paid
-- period keeps its credits until plan_period_end (lazy expiry).
--
-- One trial per CPF (decision 4): trial_used_by_cpf, called by subscribe BEFORE
-- the account exists so a barred CPF never leaves an orphan account.
--
-- Covered by trial_with_card.test.sql.
-- =============================================================================

ALTER TABLE public.subscriptions
  ADD COLUMN IF NOT EXISTS trial_ends_at timestamptz;

COMMENT ON COLUMN public.subscriptions.trial_ends_at IS
  'Trial with card: the start_date sent to MP (first charge). NULL = paid from day one.';

-- trial_used_by_cpf is a point lookup on every trial checkout.
CREATE INDEX IF NOT EXISTS profiles_cpf_idx ON public.profiles (cpf) WHERE cpf IS NOT NULL;

-- ── trial_used_by_cpf(cpf) → boolean ───────────────────────────────────────
-- A CPF that already ran a trial (invite or card) or ever held a subscription
-- row only subscribes paid. The CPF lands on the profile after an accepted or
-- pending card (recordProfileFacts), so a refused attempt never burns it.
CREATE OR REPLACE FUNCTION public.trial_used_by_cpf(p_cpf text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
      FROM public.profiles p
     WHERE p.cpf = p_cpf
       AND (p.trial_started_at IS NOT NULL
            OR EXISTS (SELECT 1 FROM public.subscriptions s WHERE s.user_id = p.id))
  );
$$;

REVOKE EXECUTE ON FUNCTION public.trial_used_by_cpf(text) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.trial_used_by_cpf(text) TO service_role;

-- ── activate_subscription: branch on trial_ends_at ──────────────────────────
CREATE OR REPLACE FUNCTION public.activate_subscription(
  p_subscription_id   uuid,
  p_mp_preapproval_id text,
  p_mp_status         text,
  p_next_payment_date timestamptz,
  p_card_brand        text,
  p_card_last_four    text
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        record;
  v_quota      integer;
  v_period_end timestamptz;
  v_left       integer;
BEGIN
  SELECT s.id, s.user_id, s.status, s.trial_ends_at, p.monthly_credits
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.id = p_subscription_id
     FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;
  IF v_sub.status IN ('authorized', 'past_due', 'paused') THEN
    RETURN jsonb_build_object('success', true, 'already', true);
  END IF;
  IF v_sub.status IN ('cancelled', 'rejected') THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_closed');
  END IF;

  v_quota := v_sub.monthly_credits;
  -- A trial's first period ends when the trial ends: the day MP collects.
  v_period_end := CASE
    WHEN v_sub.trial_ends_at IS NOT NULL THEN v_sub.trial_ends_at
    ELSE COALESCE(p_next_payment_date, now() + interval '1 month')
  END;

  BEGIN
    UPDATE public.subscriptions
       SET status               = 'authorized',
           mp_preapproval_id    = p_mp_preapproval_id,
           mp_status            = p_mp_status,
           next_payment_date    = p_next_payment_date,
           current_period_start = now(),
           current_period_end   = v_period_end,
           card_brand           = COALESCE(p_card_brand, card_brand),
           card_last_four       = COALESCE(p_card_last_four, card_last_four)
     WHERE id = p_subscription_id;
  EXCEPTION WHEN unique_violation THEN
    -- Another live subscription of this user already exists (or this
    -- preapproval id is already mirrored on another row). Close this attempt
    -- without touching the credits; the caller cancels it at MP.
    UPDATE public.subscriptions
       SET status        = 'rejected',
           status_detail = 'duplicate_live_subscription',
           mp_preapproval_id = CASE
             WHEN EXISTS (SELECT 1 FROM public.subscriptions o
                           WHERE o.mp_preapproval_id = p_mp_preapproval_id AND o.id <> p_subscription_id)
             THEN mp_preapproval_id ELSE p_mp_preapproval_id END
     WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', false, 'error', 'duplicate_live_subscription');
  END;

  IF v_sub.trial_ends_at IS NOT NULL THEN
    -- Trial with card: 50 trial credits until the trial ends, account kind
    -- 'trial'. The plan quota only lands with the first charge
    -- (renew_subscription → trial_converted). No activation invoice: nothing
    -- was granted against money.
    SELECT plan_credits INTO v_left FROM public.profiles WHERE id = v_sub.user_id FOR UPDATE;
    IF v_left > 0 THEN
      INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
      VALUES (v_sub.user_id, -v_left, 'plan_reset', p_subscription_id, 'plan');
    END IF;

    UPDATE public.profiles
       SET access_kind       = 'trial',
           trial_started_at  = now(),
           plan_credits      = 50,
           plan_period_start = now(),
           plan_period_end   = v_sub.trial_ends_at
     WHERE id = v_sub.user_id;

    INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
    VALUES (v_sub.user_id, 50, 'trial_grant', p_subscription_id, 'plan');

    RETURN jsonb_build_object(
      'success', true, 'already', false, 'trial', true,
      'plan_credits', 50, 'plan_period_end', v_sub.trial_ends_at);
  END IF;

  PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_quota, now(), v_period_end);

  -- The optimistic grant leaves a trace the first real charge can be matched to.
  INSERT INTO public.subscription_invoices (id, subscription_id, status, payment_status, granted_at)
  VALUES ('activation:' || p_subscription_id::text, p_subscription_id, 'activation', 'approved', now())
  ON CONFLICT (id) DO NOTHING;

  RETURN jsonb_build_object(
    'success', true, 'already', false,
    'plan_credits', v_quota, 'plan_period_end', v_period_end);
END;
$$;

-- ── renew_subscription: the first charge of a trial converts it ─────────────
CREATE OR REPLACE FUNCTION public.renew_subscription(
  p_subscription_id uuid,
  p_invoice         jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub        record;
  v_invoice_id text := p_invoice->>'id';
  v_paid       boolean := (p_invoice->>'payment_status') = 'approved';
  v_debit      timestamptz := NULLIF(p_invoice->>'debit_date', '')::timestamptz;
  v_claimed    boolean;
  v_period_end timestamptz;
  v_other_live boolean;
BEGIN
  IF v_invoice_id IS NULL OR v_invoice_id = '' THEN
    RETURN jsonb_build_object('success', false, 'error', 'invalid_invoice');
  END IF;

  SELECT s.id, s.user_id, s.status, s.first_payment_confirmed, s.current_period_end,
         s.trial_ends_at, p.monthly_credits
    INTO v_sub
    FROM public.subscriptions s
    JOIN public.plans p ON p.id = s.plan_id
   WHERE s.id = p_subscription_id
     FOR UPDATE OF s;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'subscription_not_found');
  END IF;

  -- Mirror first: the row is the audit trail whatever happens next.
  INSERT INTO public.subscription_invoices
    (id, subscription_id, mp_payment_id, status, payment_status, amount_brl, debit_date, retry_attempt, raw)
  VALUES
    (v_invoice_id, p_subscription_id, p_invoice->>'mp_payment_id', p_invoice->>'status',
     p_invoice->>'payment_status', NULLIF(p_invoice->>'amount_brl', '')::numeric, v_debit,
     NULLIF(p_invoice->>'retry_attempt', '')::integer, p_invoice->'raw')
  ON CONFLICT (id) DO UPDATE
    SET mp_payment_id  = COALESCE(EXCLUDED.mp_payment_id, subscription_invoices.mp_payment_id),
        status         = COALESCE(EXCLUDED.status, subscription_invoices.status),
        payment_status = COALESCE(EXCLUDED.payment_status, subscription_invoices.payment_status),
        amount_brl     = COALESCE(EXCLUDED.amount_brl, subscription_invoices.amount_brl),
        debit_date     = COALESCE(EXCLUDED.debit_date, subscription_invoices.debit_date),
        retry_attempt  = COALESCE(EXCLUDED.retry_attempt, subscription_invoices.retry_attempt),
        raw            = COALESCE(EXCLUDED.raw, subscription_invoices.raw);

  IF NOT v_paid THEN
    -- Declined (recycling) or terminally failed. A closed row stays closed.
    IF v_sub.status IN ('cancelled', 'rejected') THEN
      RETURN jsonb_build_object('success', true, 'result', 'closed');
    END IF;
    IF NOT v_sub.first_payment_confirmed THEN
      PERFORM public.clawback_subscription(p_subscription_id);
      RETURN jsonb_build_object('success', true, 'result', 'clawback');
    END IF;
    PERFORM public.mark_subscription_past_due(p_subscription_id);
    RETURN jsonb_build_object('success', true, 'result', 'past_due');
  END IF;

  -- Paid. The grant happens on the claim of granted_at, once per invoice.
  UPDATE public.subscription_invoices
     SET granted_at = now()
   WHERE id = v_invoice_id
     AND granted_at IS NULL;
  v_claimed := FOUND;

  IF NOT v_claimed THEN
    RETURN jsonb_build_object('success', true, 'result', 'already_processed');
  END IF;

  -- Money for a row that is not live (never activated, abandoned, clawed
  -- back, or cancelled locally without MP knowing). Reactivate with the quota
  -- when the user holds no other live subscription; otherwise report it so
  -- the caller cancels this preapproval at MP.
  IF v_sub.status NOT IN ('authorized', 'past_due', 'paused') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.subscriptions o
       WHERE o.user_id = v_sub.user_id AND o.id <> p_subscription_id
         AND o.status IN ('authorized', 'past_due', 'paused')
    ) INTO v_other_live;
    IF v_other_live THEN
      RETURN jsonb_build_object('success', true, 'result', 'paid_while_closed');
    END IF;

    v_period_end := COALESCE(v_debit, now()) + interval '1 month';
    UPDATE public.subscriptions
       SET status                  = 'authorized',
           first_payment_confirmed = true,
           status_detail           = NULL,
           cancelled_at            = NULL,
           current_period_start    = COALESCE(v_debit, now()),
           current_period_end      = v_period_end,
           next_payment_date       = v_period_end
     WHERE id = p_subscription_id;
    PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_sub.monthly_credits,
                                    COALESCE(v_debit, now()), v_period_end);
    RETURN jsonb_build_object('success', true, 'result', 'reactivated', 'plan_period_end', v_period_end);
  END IF;

  IF NOT v_sub.first_payment_confirmed THEN
    IF v_sub.trial_ends_at IS NOT NULL THEN
      -- Trial with card: this is the first money. The plan quota replaces what
      -- is left of the 50 trial credits and the account becomes a subscriber
      -- (apply_plan_quota does both); a new paid period opens from the debit.
      v_period_end := COALESCE(v_debit, now()) + interval '1 month';
      UPDATE public.subscriptions
         SET first_payment_confirmed = true,
             status                  = 'authorized',
             current_period_start    = COALESCE(v_debit, now()),
             current_period_end      = v_period_end,
             next_payment_date       = v_period_end
       WHERE id = p_subscription_id;
      PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_sub.monthly_credits,
                                      COALESCE(v_debit, now()), v_period_end);
      RETURN jsonb_build_object('success', true, 'result', 'trial_converted', 'plan_period_end', v_period_end);
    END IF;

    -- The first charge confirms the optimistic activation; the quota was
    -- loaded by activate_subscription (the row is live, checked above).
    UPDATE public.subscriptions
       SET first_payment_confirmed = true, status = 'authorized'
     WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'result', 'first_payment_confirmed');
  END IF;

  IF v_debit IS NOT NULL AND v_sub.current_period_end IS NOT NULL
     AND v_debit < v_sub.current_period_end - interval '1 day' THEN
    -- A payment inside the current period (e.g. a late confirmation): no new quota.
    UPDATE public.subscriptions SET status = 'authorized' WHERE id = p_subscription_id;
    RETURN jsonb_build_object('success', true, 'result', 'same_period');
  END IF;

  v_period_end := COALESCE(v_debit, now()) + interval '1 month';

  UPDATE public.subscriptions
     SET status               = 'authorized',
         current_period_start = COALESCE(v_debit, now()),
         current_period_end   = v_period_end,
         next_payment_date    = v_period_end
   WHERE id = p_subscription_id;

  PERFORM public.apply_plan_quota(v_sub.user_id, p_subscription_id, v_sub.monthly_credits,
                                  COALESCE(v_debit, now()), v_period_end);

  RETURN jsonb_build_object('success', true, 'result', 'renewed', 'plan_period_end', v_period_end);
END;
$$;

-- ── cancel_subscription_local: inside the trial the credits go now ──────────
CREATE OR REPLACE FUNCTION public.cancel_subscription_local(
  p_subscription_id uuid,
  p_cancelled_at    timestamptz
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sub  record;
  v_left integer;
BEGIN
  SELECT user_id, trial_ends_at, first_payment_confirmed
    INTO v_sub
    FROM public.subscriptions
   WHERE id = p_subscription_id
     FOR UPDATE;
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_cancellable');
  END IF;

  UPDATE public.subscriptions
     SET status = 'cancelled', cancelled_at = COALESCE(p_cancelled_at, now())
   WHERE id = p_subscription_id
     AND status IN ('pending', 'authorized', 'past_due', 'paused');
  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'not_cancellable');
  END IF;

  -- Cancelling inside the trial (no charge yet): the trial credits go now and
  -- the paywall closes (decision 3). Credits of a paid period stay until
  -- plan_period_end (lazy expiry). Guarded on the account kind so a trial row
  -- that never activated cannot touch a paid profile.
  IF v_sub.trial_ends_at IS NOT NULL AND NOT v_sub.first_payment_confirmed THEN
    SELECT plan_credits INTO v_left
      FROM public.profiles
     WHERE id = v_sub.user_id AND access_kind = 'trial'
       FOR UPDATE;
    IF FOUND THEN
      UPDATE public.profiles
         SET plan_credits = 0, plan_period_end = now()
       WHERE id = v_sub.user_id;
      IF v_left > 0 THEN
        INSERT INTO public.credit_transactions (user_id, delta, type, ref_id, bucket)
        VALUES (v_sub.user_id, -v_left, 'plan_reset', p_subscription_id, 'plan');
      END IF;
      RETURN jsonb_build_object('success', true, 'trial_closed', true, 'credits_removed', COALESCE(v_left, 0));
    END IF;
  END IF;

  RETURN jsonb_build_object('success', true);
END;
$$;
```

- [ ] **Step 4: aplicar e rodar os testes de banco**

Run: `make sb-reset && make test-db`
Expected: `trial_with_card.test.sql` 33/33 e todos os outros arquivos verdes (em especial
`subscription_rpcs.test.sql`, `subscription_webhook_guards.test.sql`, `function_hardening.test.sql`).

- [ ] **Step 5: regenerar os tipos**

Run: `make gen-types && grep -n "trial_ends_at" src/integrations/supabase/types.ts | head -3`
Expected: três ocorrências (Row / Insert / Update de `subscriptions`). Nada mais muda no arquivo
além disso (conferir com `git diff --stat src/integrations/supabase/types.ts`).

- [ ] **Step 6: commit (com aprovação do dono)**

```bash
git add supabase/migrations/20260918000000_trial_with_card.sql supabase/tests/database/trial_with_card.test.sql src/integrations/supabase/types.ts
git commit -m "feat(assinatura): trial com cartão no banco (trial_ends_at, RPCs ramificam, trial_used_by_cpf)"
```

---

### Task 2: `mpPreapproval`: `start_date` e `reason` ≤ 60

**Files:**
- Modify: `supabase/functions/_shared/mpPreapproval.ts:10-45`
- Test: `supabase/functions/_shared/mpPreapproval.test.ts`

**Interfaces:**
- Produces: `export const TRIAL_DAYS = 7`; `export const PREAPPROVAL_REASON_MAX = 60`;
  `export function trialEndDate(now: Date): Date` (agora + 7 dias, milissegundos zerados);
  `PreapprovalInput.startDate?: string` → `auto_recurring.start_date` e `reason` do trial.

- [ ] **Step 1: testes (falham)**

Acrescentar em `mpPreapproval.test.ts`, dentro de `describe("buildPreapprovalBody")`, e um
`describe` novo:

```ts
  it("schedules the first charge with start_date and a trial reason when startDate is given", () => {
    const body = buildPreapprovalBody({
      plan: { ...PLAN, name: "Básico", priceBrl: 39.9 },
      subscriptionId: "sub-1",
      payerEmail: "a@b.c",
      cardToken: "tok_1",
      backUrl: "https://x",
      startDate: "2026-09-22T21:52:15.000Z",
    });
    expect(body.reason).toBe("Teste 7 dias + Básico - Olhar Singular");
    expect(body.auto_recurring).toEqual({
      frequency: 1,
      frequency_type: "months",
      transaction_amount: 39.9,
      currency_id: "BRL",
      start_date: "2026-09-22T21:52:15.000Z",
    });
  });

  // MP answers 400 "reason has more than 60 characters" (sandbox, 2026-09-15).
  it("never sends a reason longer than 60 characters", () => {
    const long = { ...PLAN, name: "Plano Profissional Completo para Escolas Grandes" };
    const paid = buildPreapprovalBody({ plan: long, subscriptionId: "s", payerEmail: "a@b.c", cardToken: "t", backUrl: "https://x" });
    const trial = buildPreapprovalBody({ plan: long, subscriptionId: "s", payerEmail: "a@b.c", cardToken: "t", backUrl: "https://x", startDate: "2026-09-22T00:00:00.000Z" });
    expect((paid.reason as string).length).toBe(PREAPPROVAL_REASON_MAX);
    expect((trial.reason as string).length).toBe(PREAPPROVAL_REASON_MAX);
    expect(paid.reason).toBe("Assinatura Plano Profissional Completo para Escolas Grandes -".slice(0, 60));
  });
```

```ts
describe("trialEndDate", () => {
  it("is 7 days after now, with the milliseconds dropped", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(trialEndDate(new Date("2026-09-15T21:52:15.789Z")).toISOString()).toBe("2026-09-22T21:52:15.000Z");
  });
});
```

Ajustar o import do topo: `import { buildPreapprovalBody, interpretAuthorizedPayment, interpretPreapproval, parseSubscriptionNotification, PREAPPROVAL_REASON_MAX, TRIAL_DAYS, trialEndDate } from "./mpPreapproval";`

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/mpPreapproval.test.ts`
Expected: FAIL (`trialEndDate is not a function`, `start_date` ausente).

- [ ] **Step 3: implementar**

Em `mpPreapproval.ts`, substituir o bloco de `PreapprovalInput` + `buildPreapprovalBody` por:

```ts
/** Days of the trial with card (spec 2026-09-15, decision 1). */
export const TRIAL_DAYS = 7;

/** MP rejects a longer reason with 400 "reason has more than 60 characters". */
export const PREAPPROVAL_REASON_MAX = 60;

// The first charge of a trial: now + 7 days. Whole seconds: MP echoes the value
// back as next_payment_date and the row stores it as the period end.
export function trialEndDate(now: Date): Date {
  const end = new Date(now.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000);
  end.setUTCMilliseconds(0);
  return end;
}

export interface PreapprovalInput {
  plan: PlanLike;
  /** subscriptions.id, sent as external_reference so webhooks find the row. */
  subscriptionId: string;
  /** The account e-mail, not whatever the Brick showed. */
  payerEmail: string;
  cardToken: string;
  backUrl: string;
  /** ISO date of the first charge (trial with card). Omitted = MP charges now. */
  startDate?: string;
}

export function buildPreapprovalBody(input: PreapprovalInput): Record<string, unknown> {
  // Regular hyphen, not an em dash, per project pt-BR punctuation.
  const reason = input.startDate
    ? `Teste ${TRIAL_DAYS} dias + ${input.plan.name} - Olhar Singular`
    : `Assinatura ${input.plan.name} - Olhar Singular`;
  return {
    reason: reason.slice(0, PREAPPROVAL_REASON_MAX),
    external_reference: input.subscriptionId,
    payer_email: input.payerEmail,
    card_token_id: input.cardToken,
    auto_recurring: {
      frequency: 1,
      frequency_type: "months",
      transaction_amount: input.plan.priceBrl,
      currency_id: "BRL",
      ...(input.startDate ? { start_date: input.startDate } : {}),
    },
    back_url: input.backUrl,
    status: "authorized",
  };
}
```

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/mpPreapproval.test.ts`
Expected: PASS (todos, inclusive o teste antigo do body pago, que segue idêntico).

- [ ] **Step 5: commit (com aprovação)**

```bash
git add supabase/functions/_shared/mpPreapproval.ts supabase/functions/_shared/mpPreapproval.test.ts
git commit -m "feat(assinatura): preapproval com start_date do trial e reason limitado a 60 caracteres"
```

---

### Task 3: `subscribeInput`: `trial`

**Files:**
- Modify: `supabase/functions/_shared/subscribeInput.ts:6-16,47-64`
- Test: `supabase/functions/_shared/subscribeInput.test.ts`

**Interfaces:**
- Produces: `SubscribeRequest` (ok) ganha `trial: boolean` (só `true` literal vira `true`).

- [ ] **Step 1: testes (falham)**

Em `subscribeInput.test.ts`, no primeiro `it` de `parseSubscribeInput` acrescentar `trial: false`
ao `toEqual` (e no de "defaults the optional fields" também), e adicionar:

```ts
  it("reads trial only as the boolean true", () => {
    expect(parseSubscribeInput({ planSlug: "basico", card: CARD, trial: true })).toMatchObject({ ok: true, trial: true });
    expect(parseSubscribeInput({ planSlug: "basico", card: CARD, trial: "true" })).toMatchObject({ ok: true, trial: false });
    expect(parseSubscribeInput({ planSlug: "basico", card: CARD, trial: 1 })).toMatchObject({ ok: true, trial: false });
  });
```

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/subscribeInput.test.ts`
Expected: FAIL (`trial` ausente do resultado).

- [ ] **Step 3: implementar**

```ts
export type SubscribeRequest =
  | {
      ok: true;
      planSlug: string;
      card: CardFormData;
      cardLastFour: string | null;
      attribution: Record<string, unknown> | undefined;
      /** Trial with card (anonymous funnel): the server picks the plan, planSlug is ignored. */
      trial: boolean;
    }
  | { ok: false; error: "invalid_body" | "invalid_plan" | "invalid_card" | "installments_not_allowed" };
```

e em `parseSubscribeInput`: desestruturar `trial` do body e devolver `trial: trial === true`.
Atualizar o comentário do topo do arquivo: `({ planSlug, card, cardLastFour?, attribution?, trial? })`.

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/subscribeInput.test.ts`
Expected: PASS.

- [ ] **Step 5: commit (com aprovação)**

```bash
git add supabase/functions/_shared/subscribeInput.ts supabase/functions/_shared/subscribeInput.test.ts
git commit -m "feat(assinatura): subscribe aceita trial no contrato"
```

---

### Task 4: `subscribeFlow`: trial no fluxo

**Files:**
- Modify: `supabase/functions/_shared/subscribeFlow.ts`
- Test: `supabase/functions/_shared/subscribeFlow.test.ts`

**Interfaces:**
- Consumes: `trialEndDate`, `TRIAL_DAYS` (Task 2).
- Produces: `SubscribeInput.trial?: boolean`, `SubscribeInput.now?: Date`;
  `SubscribeDeps.loadCheapestPublicPlan(): Promise<PlanRow | null>`;
  `SubscribeDeps.insertSubscription(row)` recebe `trialEndsAt: string | null`;
  `SubscribeResult` (ok) ganha `planSlug: string`, `priceBrl: number` e, só no trial,
  `trialEndsAt: string`.

- [ ] **Step 1: testes (falham)**

Em `subscribeFlow.test.ts`:

1. No helper `deps()`, acrescentar `loadCheapestPublicPlan: vi.fn(async () => BASIC)` e definir
   `const BASIC = { id: "pl-basic", slug: "basico", name: "Básico", price_brl: "39.90", monthly_credits: 300, active: true, admin_only: false };`
   ao lado de `PLAN`.
2. Atualizar as asserções existentes:
   - `insertSubscription` do 1º teste: `toHaveBeenCalledWith({ userId: "u1", planId: "pl-pro", payerEmail: "account@test.com", attribution: undefined, trialEndsAt: null })`.
   - Todo `toEqual({ ok: true, status: ..., subscriptionId: "sub-1" ... })` ganha `planSlug: "profissional", priceBrl: 59.9` (linhas 73, 83, 92, 114, 172).
3. Adicionar o bloco:

```ts
describe("runSubscribe (trial with card)", () => {
  const NOW = new Date("2026-09-15T21:52:15.000Z");

  it("ignores planSlug, takes the cheapest public plan, stores trial_ends_at and schedules the first charge", async () => {
    const d = deps();
    const result = await runSubscribe(input({ planSlug: "profissional", trial: true, now: NOW }), d);

    expect(d.loadPlan).not.toHaveBeenCalled();
    expect(d.loadCheapestPublicPlan).toHaveBeenCalled();
    expect(d.insertSubscription).toHaveBeenCalledWith({
      userId: "u1", planId: "pl-basic", payerEmail: "account@test.com", attribution: undefined,
      trialEndsAt: "2026-09-22T21:52:15.000Z",
    });
    const [body] = d.postPreapproval.mock.calls[0];
    expect(body).toMatchObject({
      reason: "Teste 7 dias + Básico - Olhar Singular",
      auto_recurring: { transaction_amount: 39.9, start_date: "2026-09-22T21:52:15.000Z" },
    });
    expect(d.activate).toHaveBeenCalledWith(expect.objectContaining({ subscriptionId: "sub-1", preapprovalId: "pre-1" }));
    expect(result).toEqual({
      ok: true, status: "authorized", subscriptionId: "sub-1",
      planSlug: "basico", priceBrl: 39.9, trialEndsAt: "2026-09-22T21:52:15.000Z",
    });
  });

  it("carries trialEndsAt on a pending trial too", async () => {
    const d = deps({
      postPreapproval: vi.fn(async () => ({ ok: true, status: 201, json: { id: "pre-2", status: "pending" } })),
    });
    const result = await runSubscribe(input({ trial: true, now: NOW }), d);
    expect(result).toEqual({
      ok: true, status: "pending", subscriptionId: "sub-1",
      planSlug: "basico", priceBrl: 39.9, trialEndsAt: "2026-09-22T21:52:15.000Z",
    });
  });

  it("refuses the trial when no public plan is active", async () => {
    const d = deps({ loadCheapestPublicPlan: vi.fn(async () => null) });
    const result = await runSubscribe(input({ trial: true, now: NOW }), d);
    expect(result).toEqual({ ok: false, error: "invalid_plan", httpStatus: 400 });
    expect(d.insertSubscription).not.toHaveBeenCalled();
  });

  it("uses the wall clock when no clock is injected", async () => {
    const d = deps();
    const before = Date.now();
    const result = await runSubscribe(input({ trial: true }), d);
    const end = Date.parse((result as { trialEndsAt: string }).trialEndsAt);
    expect(end).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60 * 1000 - 1000);
    expect(end).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60 * 1000);
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/subscribeFlow.test.ts`
Expected: FAIL (resultados sem `planSlug`/`priceBrl`, `loadCheapestPublicPlan` não chamado).

- [ ] **Step 3: implementar**

Em `subscribeFlow.ts`:

```ts
import { buildPreapprovalBody, interpretPreapproval, trialEndDate, type PlanLike } from "./mpPreapproval.ts";

export interface SubscribeInput {
  userId: string;
  email: string;
  planSlug: string;
  card: CardFormData;
  cardLastFour?: string | null;
  backUrl: string;
  attribution?: Record<string, unknown>;
  /** Trial with card: the cheapest public plan, first charge in TRIAL_DAYS (decision 1). */
  trial?: boolean;
  /** Clock, injectable for tests; the wall clock otherwise. */
  now?: Date;
}
```

Em `SubscribeDeps`:

```ts
  loadPlan(slug: string): Promise<PlanRow | null>;
  /** The trial's plan is decided here, never by the client: cheapest active, not admin_only. */
  loadCheapestPublicPlan(): Promise<PlanRow | null>;
  ...
  insertSubscription(row: {
    userId: string;
    planId: string;
    payerEmail: string;
    attribution: Record<string, unknown> | undefined;
    /** ISO of the first charge for a trial; the row carries the intent (activate branches on it). */
    trialEndsAt: string | null;
  }): Promise<string>;
```

Resultado:

```ts
interface ChosenPlan {
  /** The plan the server actually used (for a trial it is not the requested slug). */
  planSlug: string;
  priceBrl: number;
  /** Trial with card: ISO of the first charge. Absent on a paid-from-day-one attempt and on rejections. */
  trialEndsAt?: string;
}

export type SubscribeResult =
  | ({ ok: true; status: "authorized" | "pending"; subscriptionId: string } & ChosenPlan)
  | ({ ok: true; status: "rejected"; subscriptionId: string; detail: string } & ChosenPlan)
  | { ok: false; error: "invalid_plan" | "exempt_user" | "already_subscribed" | "attempt_in_progress" | "profile_not_found"; httpStatus: number };
```

Corpo de `runSubscribe` (trechos que mudam):

```ts
  const planRow = input.trial ? await deps.loadCheapestPublicPlan() : await deps.loadPlan(input.planSlug);
  if (!planRow || !planRow.active || (planRow.admin_only && !profile.is_super_admin)) {
    return { ok: false, error: "invalid_plan", httpStatus: 400 };
  }
  const plan = toPlanLike(planRow);
  const chosen: ChosenPlan = { planSlug: plan.slug, priceBrl: plan.priceBrl };
  // The trial's first charge: computed here (never by the client) and written on
  // the row before MP is called, so activation knows it is a trial whichever
  // path reaches it (synchronous authorized or the webhook).
  const trialEndsAt = input.trial ? trialEndDate(input.now ?? new Date()).toISOString() : null;
  const trialFields = trialEndsAt ? { trialEndsAt } : {};
  ...
  const subscriptionId = await deps.insertSubscription({
    userId: input.userId,
    planId: plan.id,
    payerEmail: input.email,
    attribution: input.attribution,
    trialEndsAt,
  });

  const body = buildPreapprovalBody({
    plan,
    subscriptionId,
    payerEmail: input.email,
    cardToken: input.card.token,
    backUrl: input.backUrl,
    startDate: trialEndsAt ?? undefined,
  });
```

e cada `return` de sucesso passa a incluir `...chosen` (e `...trialFields` nos de
`authorized`/`pending`):

```ts
      await deps.reject({ subscriptionId, detail: "network_error" });
      return { ok: true, status: "rejected", subscriptionId, detail: "network_error", ...chosen };
  ...
      await deps.reject({ subscriptionId, detail });
      return { ok: true, status: "rejected", subscriptionId, detail, ...chosen };
    }
    return { ok: true, status: "authorized", subscriptionId, ...chosen, ...trialFields };
  }

  if (httpOk && outcome.status === "pending" && outcome.preapprovalId) {
    await deps.markPending({ subscriptionId, preapprovalId: outcome.preapprovalId, mpStatus: "pending" });
    return { ok: true, status: "pending", subscriptionId, ...chosen, ...trialFields };
  }

  const detail = outcome.statusDetail as string;
  await deps.reject({ subscriptionId, detail });
  return { ok: true, status: "rejected", subscriptionId, detail, ...chosen };
```

Comentário de cabeçalho do arquivo: acrescentar "trial with card: cheapest public plan,
`trial_ends_at` on the row, `start_date` at MP".

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/subscribeFlow.test.ts supabase/functions/_shared/accountProvision.test.ts`
Expected: `subscribeFlow` PASS. `accountProvision.test.ts` **falha** em dois `toEqual` (linhas 83 e
102: o `result` agora tem `planSlug: "profissional", priceBrl: 59.9`) e por `subscribeDeps()` sem
`loadCheapestPublicPlan`: é a Task 5 que os ajusta, mas a suíte inteira precisa estar verde antes do
commit, então faça esses dois ajustes agora (acrescentar `loadCheapestPublicPlan: vi.fn(async () => PLAN)`
ao `subscribeDeps()` e `planSlug: "profissional", priceBrl: 59.9` nos dois `result`).

- [ ] **Step 5: commit (com aprovação)**

```bash
git add supabase/functions/_shared/subscribeFlow.ts supabase/functions/_shared/subscribeFlow.test.ts supabase/functions/_shared/accountProvision.test.ts
git commit -m "feat(assinatura): runSubscribe cria o trial com o plano mais barato e start_date em 7 dias"
```

---

### Task 5: `accountProvision`: as três barreiras do trial

**Files:**
- Modify: `supabase/functions/_shared/accountProvision.ts`
- Test: `supabase/functions/_shared/accountProvision.test.ts`

**Interfaces:**
- Consumes: `extractCpf` (`checkoutGuard.ts`), `runSubscribe` com `trial`/`now` (Task 4).
- Produces: `CheckoutInput.trial?: boolean`, `CheckoutInput.now?: Date`;
  `CheckoutDeps.trialUsedByCpf(cpf: string): Promise<boolean>`; erros
  `trial_requires_new_account` (400), `cpf_required` (400), `trial_used` (409).

- [ ] **Step 1: testes (falham)**

No helper `deps()` acrescentar `trialUsedByCpf: vi.fn(async () => false)`. Adicionar:

```ts
describe("runAnonymousCheckout (trial with card)", () => {
  const NOW = new Date("2026-09-15T21:52:15.000Z");

  it("checks the CPF before creating the account and runs the trial", async () => {
    const d = deps();
    const out = await runAnonymousCheckout(anonymous({ trial: true, now: NOW }), d);
    expect(d.trialUsedByCpf).toHaveBeenCalledWith("12345678909");
    expect(d.createUser).toHaveBeenCalled();
    expect(d.subscribeDeps.insertSubscription).toHaveBeenCalledWith(
      expect.objectContaining({ userId: "new-user", trialEndsAt: "2026-09-22T21:52:15.000Z" }),
    );
    expect(out).toMatchObject({ ok: true, result: { status: "authorized", trialEndsAt: "2026-09-22T21:52:15.000Z" }, accountCreated: true });
    expect(d.recordProfileFacts).toHaveBeenCalledWith({ userId: "new-user", cpf: "12345678909", termsVersion: "2026-09" });
  });

  it("refuses a CPF that already had a trial or a subscription, leaving no account behind", async () => {
    const d = deps({ trialUsedByCpf: vi.fn(async () => true) });
    const out = await runAnonymousCheckout(anonymous({ trial: true }), d);
    expect(out).toEqual({ ok: false, error: "trial_used", httpStatus: 409 });
    expect(d.createUser).not.toHaveBeenCalled();
    expect(d.subscribeDeps.postPreapproval).not.toHaveBeenCalled();
  });

  it("requires a valid CPF for the trial (a scripted caller cannot skip decision 4)", async () => {
    const d = deps();
    const noCpf = { ...CARD, payer: { identification: { type: "CPF", number: "111.111.111-11" } } };
    const out = await runAnonymousCheckout(anonymous({ trial: true, card: noCpf }), d);
    expect(out).toEqual({ ok: false, error: "cpf_required", httpStatus: 400 });
    expect(d.trialUsedByCpf).not.toHaveBeenCalled();
    expect(d.createUser).not.toHaveBeenCalled();
  });

  it("is for new accounts only: a logged-in user asking for the trial is refused", async () => {
    const d = deps();
    const out = await runAnonymousCheckout(
      anonymous({ trial: true, user: { id: "u1", email: "a@b.c" }, account: null }),
      d,
    );
    expect(out).toEqual({ ok: false, error: "trial_requires_new_account", httpStatus: 400 });
    expect(d.recordAttempt).not.toHaveBeenCalled();
  });

  it("still applies the rate limit before the CPF check", async () => {
    const d = deps({ recordAttempt: vi.fn(async () => ({ by_email_1h: 6, by_ip_1h: 1, rejected_10m: 0 })) });
    const out = await runAnonymousCheckout(anonymous({ trial: true }), d);
    expect(out).toMatchObject({ ok: false, error: "rate_limited" });
    expect(d.trialUsedByCpf).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/accountProvision.test.ts`
Expected: FAIL (`trialUsedByCpf` nunca chamado; erros novos ausentes).

- [ ] **Step 3: implementar**

```ts
export interface CheckoutInput {
  /** Set when a valid user JWT came with the request (logged-in flow). */
  user: { id: string; email: string } | null;
  /** Required when `user` is null. */
  account: AccountInput | null;
  planSlug: string;
  card: SubscribeInput["card"];
  cardLastFour?: string | null;
  backUrl: string;
  attribution?: Record<string, unknown>;
  clientIp: string;
  /** Trial with card: anonymous funnel only, one per CPF (decisions 1 and 4). */
  trial?: boolean;
  /** Clock, injectable for tests. */
  now?: Date;
}

export interface CheckoutDeps {
  subscribeDeps: SubscribeDeps;
  hash(value: string): Promise<string>;
  recordAttempt(ipHash: string, emailHash: string, outcome: "attempt" | "authorized" | "pending" | "rejected" | "refused"): Promise<AttemptCounts>;
  createUser(input: { email: string; fullName: string }): Promise<{ id: string } | "exists">;
  recordProfileFacts(input: { userId: string; cpf: string | null; termsVersion: string | null }): Promise<void>;
  /** RPC trial_used_by_cpf: this CPF already ran a trial or held a subscription. */
  trialUsedByCpf(cpf: string): Promise<boolean>;
  log(message: string, ...args: unknown[]): void;
}

export type CheckoutResult =
  | { ok: true; result: Extract<SubscribeResult, { ok: true }>; userId: string; accountCreated: boolean }
  | {
      ok: false;
      error:
        | "account_required" | "rate_limited" | "circuit_open" | "email_exists"
        | "trial_requires_new_account" | "cpf_required" | "trial_used"
        | Extract<SubscribeResult, { ok: false }>["error"];
      httpStatus: number;
    };
```

No corpo, logo após a checagem de `account_required`:

```ts
  // Whoever has an account subscribes paid at /assinar (decision: trial = new account).
  if (input.trial && input.user) return { ok: false, error: "trial_requires_new_account", httpStatus: 400 };
```

Depois do rate limit e antes de `createUser`:

```ts
  if (input.trial) {
    // One trial per CPF (decision 4), checked BEFORE the account exists so a
    // barred CPF never leaves an orphan account. The Brick always sends the
    // CPF; only a scripted caller reaches cpf_required.
    const cpf = extractCpf(input.card.payer);
    if (!cpf) return { ok: false, error: "cpf_required", httpStatus: 400 };
    if (await deps.trialUsedByCpf(cpf)) return { ok: false, error: "trial_used", httpStatus: 409 };
  }
```

E na chamada a `runSubscribe`, acrescentar `trial: input.trial, now: input.now`.

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/accountProvision.test.ts`
Expected: PASS.

- [ ] **Step 5: commit (com aprovação)**

```bash
git add supabase/functions/_shared/accountProvision.ts supabase/functions/_shared/accountProvision.test.ts
git commit -m "feat(assinatura): trial só para conta nova, um por CPF, checado antes de criar a conta"
```

---

### Task 6: wiring no servidor (`subscribe/index.ts`, `mp-webhook`, analytics) + `fn-check`

**Files:**
- Modify: `supabase/functions/_shared/analyticsEvents.ts:21-27,48-55`
- Test: `supabase/functions/_shared/analyticsEvents.test.ts`
- Modify: `supabase/functions/subscribe/index.ts` (glue, fora da cobertura)
- Modify: `supabase/functions/mp-webhook/index.ts:98-101` (glue)

**Interfaces:**
- Consumes: Tasks 3, 4 e 5.
- Produces: `AnalyticsEventName` ganha `"trial_started"` (Meta `StartTrial`); resposta do `subscribe`
  ganha `trialEndsAt` (ISO) quando trial; códigos `trial_requires_new_account`, `cpf_required`,
  `trial_used` com mensagem pt-BR; `mp-webhook` emite `subscription_renewed` também para
  `trial_converted`.

- [ ] **Step 1: teste do analytics (falha)**

Em `analyticsEvents.test.ts`, ao lado do teste que checa `event_name: "Subscribe"`, acrescentar um
caso que envia `{ name: "trial_started", eventId: "sub-9", userId: "u1", valueBrl: 0 }` com a
mesma config/`fetch` fake do teste vizinho e verifica que o body do Meta tem
`event_name: "StartTrial"` e o do GA4 tem `events: [{ name: "trial_started", ... }]`. (Copiar a
estrutura do teste vizinho; só o nome do evento e a asserção mudam.)

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run supabase/functions/_shared/analyticsEvents.test.ts`
Expected: FAIL (`META_EVENT_NAMES["trial_started"]` é `undefined`).

- [ ] **Step 3: implementar analytics**

```ts
export type AnalyticsEventName =
  | "purchase"
  | "subscription_started"
  | "trial_started"
  | "subscription_renewed"
  | "subscription_payment_failed"
  | "subscription_cancelled"
  | "refund";

const META_EVENT_NAMES: Record<AnalyticsEventName, string> = {
  purchase: "Purchase",
  subscription_started: "Subscribe",
  trial_started: "StartTrial",
  subscription_renewed: "Purchase",
  subscription_payment_failed: "SubscriptionPaymentFailed",
  subscription_cancelled: "SubscriptionCancelled",
  refund: "Refund",
};
```

Run: `docker compose exec app npx vitest run supabase/functions/_shared/analyticsEvents.test.ts` → PASS.

- [ ] **Step 4: `subscribe/index.ts`**

1. `FLOW_ERRORS` ganha:

```ts
  trial_requires_new_account: "Você já tem conta: o teste é só para contas novas. Assine um plano em Créditos.",
  cpf_required: "Informe um CPF válido para começar o teste.",
  trial_used: "Este CPF já usou o teste. Você pode assinar um plano com o mesmo cartão.",
```

2. `deps` (SubscribeDeps): depois de `loadPlan`, acrescentar

```ts
      loadCheapestPublicPlan: async () => {
        const { data, error } = await admin
          .from("plans")
          .select("*")
          .eq("active", true)
          .eq("admin_only", false)
          .order("price_brl", { ascending: true })
          .limit(1)
          .maybeSingle();
        if (error) throw new Error(`plans lookup failed: ${error.message}`);
        return data;
      },
```

e no `insertSubscription`, o objeto do `.insert({...})` ganha `trial_ends_at: row.trialEndsAt`.

3. `checkoutDeps` ganha

```ts
      trialUsedByCpf: async (cpf) => {
        const { data, error } = await admin.rpc("trial_used_by_cpf", { p_cpf: cpf });
        if (error) throw new Error(`trial_used_by_cpf failed: ${error.message}`);
        return data === true;
      },
```

4. A chamada a `runAnonymousCheckout` ganha `trial: parsed.trial,`.

5. O bloco de analytics deixa de reconsultar `plans` (o resultado já diz o plano):

```ts
    if (result.status !== "rejected") {
      // Server-side conversion (GA4 MP / Meta CAPI); no-op without secrets.
      const trial = !!result.trialEndsAt;
      await dispatchAnalytics(sendAnalyticsEvents(
        [{
          name: trial ? "trial_started" : "subscription_started",
          eventId: result.subscriptionId,
          userId: outcome.userId,
          valueBrl: trial ? 0 : result.priceBrl,
          email: user?.email ?? account?.email ?? null,
          attribution: (parsed.attribution ?? null) as AttributionLike | null,
          params: {
            plan: result.planSlug,
            status: result.status,
            account_created: accountCreated,
            ...(trial ? { trial_ends_at: result.trialEndsAt as string } : {}),
          },
        }],
        readAnalyticsConfig(Deno.env),
      ));
    }
```

6. Resposta final:

```ts
    return json({
      status: result.status,
      subscriptionId: result.subscriptionId,
      accountCreated,
      ...(result.trialEndsAt ? { trialEndsAt: result.trialEndsAt } : {}),
    });
```

Atualizar o comentário de cabeçalho da `serve` para citar o trial ("with `trial: true` in the
anonymous flow the cheapest public plan starts free for 7 days").

- [ ] **Step 5: `mp-webhook/index.ts`**

Linha 99: o primeiro dinheiro de um trial é receita como uma renovação:

```ts
      const analyticsName: AnalyticsEvent["name"] | null =
        outcome.handled && (outcome.result === "renewed" || outcome.result === "trial_converted") ? "subscription_renewed"
        : outcome.handled && (outcome.result === "past_due" || outcome.result === "clawback") ? "subscription_payment_failed"
        : null;
```

- [ ] **Step 6: type-check das functions**

Run: `make fn-check`
Expected: sem erros (o Deno resolve `trial_ends_at` no insert porque o client é `createClient` sem
tipos gerados; `result.priceBrl`/`planSlug`/`trialEndsAt` vêm do tipo de `SubscribeResult`).

- [ ] **Step 7: commit (com aprovação)**

```bash
git add supabase/functions/_shared/analyticsEvents.ts supabase/functions/_shared/analyticsEvents.test.ts supabase/functions/subscribe/index.ts supabase/functions/mp-webhook/index.ts
git commit -m "feat(assinatura): subscribe liga o trial (plano mais barato, CPF, trialEndsAt) e emite trial_started"
```

---

### Task 7: cliente: `parseInvokeFailure`, `useSubscription` (trial, código de erro, cancel do trial), `trackTrialStarted`

**Files:**
- Modify: `src/lib/utils/errors.ts:55-75`
- Test: `src/lib/utils/errors.test.ts`
- Modify: `src/hooks/useSubscription.ts`
- Test: `src/hooks/useSubscription.test.ts`
- Modify: `src/lib/analytics/events.ts`
- Test: `src/lib/analytics/events.test.ts`
- Modify (fixtures): todo teste que monta um `SubscriptionView` literal ganha `trialEndsAt: null`
  (`grep -rln "firstPaymentConfirmed:" src --include=*.test.tsx --include=*.test.ts`).

**Interfaces:**
- Produces: `parseInvokeFailure(err, fallback): Promise<{ message: string; code: string | null }>`;
  `SubscribeInput.trial?: boolean`; `SubscribeResult.trialEndsAt?: string | null`;
  `subscribeErrorCode(err: unknown): string | null`; `useCancelSubscription({ trial?: boolean })`;
  `SubscriptionView.trialEndsAt: Date | null`; `trackTrialStarted(plan, subscriptionId, status)`.

- [ ] **Step 1: testes (falham)**

`errors.test.ts` (ao lado dos testes de `parseInvokeError`):

```ts
describe("parseInvokeFailure", () => {
  it("returns the backend message and code from the response body", async () => {
    const err = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: "Este CPF já usou o teste.", code: "trial_used" }), { status: 409 }),
    });
    await expect(parseInvokeFailure(err, "fallback")).resolves.toEqual({ message: "Este CPF já usou o teste.", code: "trial_used" });
  });

  it("has no code when the body carries none, or when the error is not the generic invoke one", async () => {
    const err = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: "Plano inválido." }), { status: 400 }),
    });
    await expect(parseInvokeFailure(err, "fallback")).resolves.toEqual({ message: "Plano inválido.", code: null });
    await expect(parseInvokeFailure(new Error("boom"), "fallback")).resolves.toEqual({ message: "boom", code: null });
    await expect(parseInvokeFailure({}, "fallback")).resolves.toEqual({ message: "fallback", code: null });
  });
});
```

`useSubscription.test.ts`:

- `SUB_ROW` ganha `trial_ends_at: null`; no teste que compara `toSubscriptionView(...)`, esperar
  `trialEndsAt: null`, e adicionar:

```ts
  it("reads trial_ends_at as a Date", () => {
    expect(toSubscriptionView({ ...SUB_ROW, trial_ends_at: "2026-09-22T21:52:15Z" } as never).trialEndsAt).toEqual(new Date("2026-09-22T21:52:15Z"));
  });
```

- Em `describe("useSubscribe (anonymous funnel)")`:

```ts
  it("forwards trial and returns trialEndsAt", async () => {
    mockInvoke.mockResolvedValue({ data: { status: "authorized", subscriptionId: "sub-1", accountCreated: true, trialEndsAt: "2026-09-22T21:52:15.000Z" }, error: null });
    const { result } = renderHook(() => useSubscribe(), { wrapper });
    const account = { fullName: "Ana", email: "a@b.c", termsVersion: "2026-09" };
    let out: unknown;
    await act(async () => {
      out = await result.current.mutateAsync({ planSlug: "basico", card: CARD, account, trial: true });
    });
    expect(mockInvoke).toHaveBeenCalledWith("subscribe", { body: { planSlug: "basico", card: CARD, account, trial: true } });
    expect(out).toMatchObject({ trialEndsAt: "2026-09-22T21:52:15.000Z" });
  });

  it("exposes the backend code on the error and does not toast trial_used (the page answers inline)", async () => {
    const { toast } = await import("sonner");
    const error = Object.assign(new Error("Edge Function returned a non-2xx status code"), {
      context: new Response(JSON.stringify({ error: "Este CPF já usou o teste.", code: "trial_used" }), { status: 409 }),
    });
    mockInvoke.mockResolvedValue({ data: null, error });
    const { result } = renderHook(() => useSubscribe(), { wrapper });
    let caught: unknown;
    await act(async () => {
      try { await result.current.mutateAsync({ planSlug: "basico", card: CARD, trial: true }); } catch (e) { caught = e; }
    });
    expect(subscribeErrorCode(caught)).toBe("trial_used");
    expect((caught as Error).message).toBe("Este CPF já usou o teste.");
    expect(toast.error).not.toHaveBeenCalled();
    expect(subscribeErrorCode(new Error("x"))).toBeNull();
    expect(subscribeErrorCode(null)).toBeNull();
  });
```

- Em `describe("useCancelSubscription")`:

```ts
  it("confirms a trial cancellation without promising credits until the period end", async () => {
    const { toast } = await import("sonner");
    mockInvoke.mockResolvedValue({ data: { status: "cancelled", subscriptionId: "sub-1" }, error: null });
    const { result } = renderHook(() => useCancelSubscription({ trial: true }), { wrapper });
    await act(async () => { await result.current.mutateAsync(); });
    expect(toast.success).toHaveBeenCalledWith("Teste cancelado. Nada foi cobrado.");
  });
```

`events.test.ts`: ao lado do teste de `trackSubscriptionStarted`, adicionar:

```ts
  it("trial_started carries the plan with value 0 and the subscription id as event_id", () => {
    window.dataLayer = [];
    trackTrialStarted({ id: "b", slug: "basico", name: "Básico", priceBrl: 39.9 }, "sub-1", "authorized");
    expect(window.dataLayer[0]).toMatchObject({
      event: "trial_started", event_id: "sub-1", transaction_id: "sub-1", currency: "BRL", value: 0, status: "authorized",
      items: [{ item_id: "basico", price: 39.9 }],
    });
  });
```

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run src/lib/utils/errors.test.ts src/hooks/useSubscription.test.ts src/lib/analytics/events.test.ts`
Expected: FAIL (funções inexistentes).

- [ ] **Step 3: implementar**

`errors.ts`: substituir `parseInvokeError` por

```ts
export interface InvokeFailure {
  message: string;
  /** The backend's machine-readable code ({ code } in the JSON body), when it sent one. */
  code: string | null;
}

/**
 * For supabase.functions.invoke() errors: reads the real JSON body (message + code)
 * before falling back to parseEdgeFnError. The message is always user-safe.
 */
export async function parseInvokeFailure(err: unknown, fallback: string): Promise<InvokeFailure> {
  if (err instanceof Error && err.message.toLowerCase() !== SUPABASE_GENERIC_INVOKE_MSG) {
    return { message: parseEdgeFnError(err, fallback), code: null };
  }
  const context = (err as Record<string, unknown>)?.context as { json?: () => Promise<unknown> } | undefined;
  if (context?.json) {
    try {
      const body = (await context.json()) as Record<string, unknown> | null;
      const errorMsg = body?.error;
      const code = typeof body?.code === "string" && body.code ? body.code : null;
      if (typeof errorMsg === "string" && errorMsg) return { message: errorMsg, code };
    } catch {
      // body already consumed or not JSON — fall through
    }
  }
  return { message: fallback, code: null };
}

/** parseInvokeFailure without the code. */
export async function parseInvokeError(err: unknown, fallback: string): Promise<string> {
  return (await parseInvokeFailure(err, fallback)).message;
}
```

`useSubscription.ts`:

```ts
import { parseInvokeError, parseInvokeFailure, parseEdgeFnError } from "@/lib/utils/errors";

export interface SubscriptionView {
  ...
  firstPaymentConfirmed: boolean;
  /** Trial with card: when MP collects the first charge. Null for a paid-from-day-one row. */
  trialEndsAt: Date | null;
  createdAt: Date | null;
}
// em toSubscriptionView: trialEndsAt: dateOrNull(row.trial_ends_at),

export interface SubscribeResult {
  status: "authorized" | "pending" | "rejected";
  subscriptionId: string;
  statusDetail?: string;
  message?: string;
  accountCreated?: boolean;
  /** Trial with card: ISO date of the first charge. */
  trialEndsAt?: string | null;
}

export interface SubscribeInput {
  planSlug: string;
  card: CardFormDataView;
  cardLastFour?: string | null;
  account?: SubscribeAccountInput;
  attribution?: Record<string, unknown>;
  /** Trial with card (anonymous funnel only): the server picks the cheapest plan. */
  trial?: boolean;
}

/** The backend's code on a subscribe refusal (e.g. "trial_used"), null otherwise. */
export function subscribeErrorCode(err: unknown): string | null {
  const code = (err as { code?: unknown } | null)?.code;
  return typeof code === "string" ? code : null;
}

export function useSubscribe() {
  const refresh = useSubscriptionRefresh();
  return useMutation({
    mutationFn: async (input: SubscribeInput) => {
      const { data, error } = await supabase.functions.invoke("subscribe", { body: input });
      if (error) {
        const failure = await parseInvokeFailure(error, SUBSCRIBE_FALLBACK);
        throw Object.assign(new Error(failure.message), { code: failure.code });
      }
      return data as SubscribeResult;
    },
    onSuccess: refresh,
    // trial_used is answered inline by the page (same card, paid plan, one click).
    onError: (err: Error) => {
      if (subscribeErrorCode(err) !== "trial_used") toast.error(parseEdgeFnError(err, SUBSCRIBE_FALLBACK));
    },
  });
}

// `trial`: cancelling inside the trial removes the trial credits at once, so the
// confirmation must not promise them until the period end.
export function useCancelSubscription({ trial = false }: { trial?: boolean } = {}) {
  const refresh = useSubscriptionRefresh();
  return useMutation({
    mutationFn: async () => { ...igual... },
    onSuccess: () => {
      refresh();
      toast.success(trial ? "Teste cancelado. Nada foi cobrado." : "Assinatura cancelada. Seus créditos valem até o fim do período pago.");
    },
    onError: (err: Error) => toast.error(parseEdgeFnError(err, CANCEL_FALLBACK)),
  });
}
```

`events.ts`:

```ts
/** Trial with card: no money yet (value 0), same dedupe key as the subscription. */
export function trackTrialStarted(plan: PlanItem, subscriptionId: string, status: "authorized" | "pending"): void {
  pushEvent("trial_started", {
    event_id: subscriptionId,
    transaction_id: subscriptionId,
    currency: "BRL",
    value: 0,
    status,
    items: [planItem(plan)],
  });
}
```

Fixtures: acrescentar `trialEndsAt: null` em cada objeto `SubscriptionView` literal dos testes
(`AccessBanner.test.tsx`, `SubscriptionCard.test.tsx`, `Layout.test.tsx` se houver, e qualquer
outro que o grep do cabeçalho apontar).

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run src/lib/utils src/hooks/useSubscription.test.ts src/lib/analytics src/components/common src/components/credits`
Expected: PASS.

- [ ] **Step 5: commit (com aprovação)**

```bash
git add src/lib/utils/errors.ts src/lib/utils/errors.test.ts src/hooks/useSubscription.ts src/hooks/useSubscription.test.ts src/lib/analytics/events.ts src/lib/analytics/events.test.ts src/components/common/AccessBanner.test.tsx src/components/credits/SubscriptionCard.test.tsx
git commit -m "feat(assinatura): hooks e erros do cliente conhecem o trial (trialEndsAt, código de erro, cancelamento)"
```

---

### Task 8: helpers de UI (`subscriptionUi`) e `MpCardBrick.submitLabel`

**Files:**
- Modify: `src/lib/domain/subscriptionUi.ts`
- Test: `src/pages/SubscribePage.test.tsx` (bloco de helpers, no topo, ao lado de `pickInitialPlan`)
- Modify: `src/components/payments/MpCardBrick.tsx`
- Test: `src/components/payments/MpCardBrick.test.tsx`

**Interfaces:**
- Produces: `TRIAL_DAYS = 7`, `TRIAL_CREDITS = 50`, `cheapestPublicPlan(plans: PlanView[]): PlanView | null`,
  `trialFirstChargeDate(now: Date): Date`, `isCardTrial(sub): boolean`, `TERMS_VERSION = "2026-09.2"`;
  `MpCardBrickProps.submitLabel?: string`.

- [ ] **Step 1: testes (falham)**

`SubscribePage.test.tsx`, novos `describe` de helpers (fora dos `describe` da página):

```ts
describe("trial helpers", () => {
  it("cheapestPublicPlan picks the lowest price among non-admin plans", () => {
    const smoke = { ...BASIC, id: "t", slug: "teste-admin", priceBrl: 1, adminOnly: true };
    expect(cheapestPublicPlan([PRO, ADV, BASIC, smoke])).toBe(BASIC);
    expect(cheapestPublicPlan([smoke])).toBeNull();
    expect(cheapestPublicPlan([])).toBeNull();
  });

  it("trialFirstChargeDate is 7 days ahead", () => {
    expect(TRIAL_DAYS).toBe(7);
    expect(TRIAL_CREDITS).toBe(50);
    expect(trialFirstChargeDate(new Date("2026-09-15T12:00:00Z"))).toEqual(new Date("2026-09-22T12:00:00Z"));
  });

  it("isCardTrial is a live row born as a trial that MP has not charged yet", () => {
    const base = {
      id: "s", status: "authorized" as const, statusDetail: null, plan: null, nextPaymentDate: null,
      currentPeriodEnd: null, cancelledAt: null, cardBrand: null, cardLastFour: null,
      firstPaymentConfirmed: false, trialEndsAt: new Date("2026-09-22T12:00:00Z"), createdAt: null,
    };
    expect(isCardTrial(base)).toBe(true);
    expect(isCardTrial({ ...base, status: "past_due" })).toBe(true);
    expect(isCardTrial({ ...base, firstPaymentConfirmed: true })).toBe(false);
    expect(isCardTrial({ ...base, trialEndsAt: null })).toBe(false);
    expect(isCardTrial({ ...base, status: "cancelled" })).toBe(false);
    expect(isCardTrial(null)).toBe(false);
    expect(isCardTrial(undefined)).toBe(false);
  });
});
```

Imports no topo: `import { cheapestPublicPlan, isCardTrial, pickInitialPlan, replacementNotice, TERMS_VERSION, TRIAL_CREDITS, TRIAL_DAYS, trialFirstChargeDate } from "@/lib/domain/subscriptionUi";`
e trocar o literal `termsVersion: "2026-09"` (linha 319) por `termsVersion: TERMS_VERSION`.

`MpCardBrick.test.tsx`:

```ts
  it("labels the Brick's submit button when submitLabel is given, and leaves MP's default otherwise", () => {
    render(<MpCardBrick amount={39.9} onSubmit={vi.fn()} submitLabel="Começar o teste" />);
    expect(cardPaymentProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ customization: { paymentMethods: { maxInstallments: 1 }, visual: { texts: { formSubmit: "Começar o teste" } } } }),
    );
    render(<MpCardBrick amount={39.9} onSubmit={vi.fn()} />);
    expect(cardPaymentProps).toHaveBeenLastCalledWith(
      expect.objectContaining({ customization: { paymentMethods: { maxInstallments: 1 } } }),
    );
  });
```

(Usar o mesmo `beforeEach` do arquivo, que define `VITE_MP_PUBLIC_KEY`; conferir como os testes
vizinhos renderizam e copiar a preparação.)

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run src/pages/SubscribePage.test.tsx src/components/payments/MpCardBrick.test.tsx`
Expected: FAIL (exports inexistentes; `customization` sem `visual`).

- [ ] **Step 3: implementar**

`subscriptionUi.ts` (acrescentar; `addDays` vem de `date-fns`, já dependência):

```ts
import { addDays, format } from "date-fns";
import type { PlanView, SubscriptionStatus, SubscriptionView } from "@/hooks/useSubscription";

/** Trial with card (spec 2026-09-15, decision 1). Mirrors TRIAL_DAYS in _shared/mpPreapproval.ts. */
export const TRIAL_DAYS = 7;
export const TRIAL_CREDITS = 50;

// The trial runs on the cheapest public plan: the server decides (subscribeFlow),
// this mirror only feeds the copy. Null while the catalogue is empty.
export function cheapestPublicPlan(plans: PlanView[]): PlanView | null {
  return plans
    .filter((p) => !p.adminOnly)
    .reduce<PlanView | null>((best, p) => (best === null || p.priceBrl < best.priceBrl ? p : best), null);
}

// The date shown before the checkout; the server's trialEndsAt is the truth after it.
export function trialFirstChargeDate(now: Date): Date {
  return addDays(now, TRIAL_DAYS);
}

const LIVE_STATUSES: readonly SubscriptionStatus[] = ["authorized", "past_due", "paused"];

// A live subscription born as a trial that MP has not charged yet: the card,
// the banner and the cancel dialog read differently until the first charge.
export function isCardTrial(sub: SubscriptionView | null | undefined): boolean {
  return !!sub && LIVE_STATUSES.includes(sub.status) && sub.trialEndsAt !== null && !sub.firstPaymentConfirmed;
}
```

e `export const TERMS_VERSION = "2026-09.2";` (o texto dos Termos muda na Task 12; o servidor aceita
`[a-z0-9.\-]`).

`MpCardBrick.tsx`:

```ts
export interface MpCardBrickProps {
  amount: number;
  payerEmail?: string;
  onSubmit: (card: CardFormDataView) => Promise<void>;
  onError?: (message: string) => void;
  /** Text of the Brick's submit button; MP's default ("Pagar") when omitted. */
  submitLabel?: string;
}

// Instalments pinned to 1. Module-level so its identity never changes.
const BASE_CUSTOMIZATION = { paymentMethods: { maxInstallments: 1 } };

// ...dentro do componente, no lugar de usar CUSTOMIZATION direto:
  // Stable per label: a new object would re-create the Brick (see the note above).
  const customization = useMemo(
    () => (submitLabel ? { ...BASE_CUSTOMIZATION, visual: { texts: { formSubmit: submitLabel } } } : BASE_CUSTOMIZATION),
    [submitLabel],
  );
```

e `customization={customization}` no `<CardPayment>`.

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run src/pages/SubscribePage.test.tsx src/components/payments/MpCardBrick.test.tsx src/components/landing src/components/credits src/components/common`
Expected: PASS.

- [ ] **Step 5: commit (com aprovação)**

```bash
git add src/lib/domain/subscriptionUi.ts src/pages/SubscribePage.test.tsx src/components/payments/MpCardBrick.tsx src/components/payments/MpCardBrick.test.tsx
git commit -m "feat(assinatura): helpers do trial na UI e rótulo do botão do Brick"
```

---

### Task 9: landing: card "Teste grátis", FAQ e guarda de copy

**Files:**
- Modify: `src/test/copyGuard.test.ts`
- Modify: `src/components/landing/PricingSection.tsx:1-60`
- Test: `src/components/landing/PricingSection.test.tsx`
- Modify: `src/components/landing/FaqSection.tsx:4-40`
- Test: `src/components/landing/FaqSection.test.tsx`

**Interfaces:**
- Consumes: `cheapestPublicPlan`, `publicPlans`, `formatBrl`, `TRIAL_CREDITS`, `TRIAL_DAYS` (Task 8).

- [ ] **Step 1: guarda de copy (primeiro, senão a task inteira falha por ela)**

`src/test/copyGuard.test.ts`:

```ts
// Copy that the payments redesign retired must not creep back into the UI:
// plan credits DO expire and Stripe is gone. "grátis" is allowed only for the
// 7-day trial with card (2026-09-15): on a line that also says teste/testar.
const FORBIDDEN = /gratuit|nunca expiram|Stripe/i;
const FREE = /gr[áa]tis/i;
const TRIAL = /test(e|ar)/i;

function offends(line: string): boolean {
  return FORBIDDEN.test(line) || (FREE.test(line) && !TRIAL.test(line));
}
```

e no `it`: `lines.map((line, i) => (offends(line) ? ... : null))`; título do teste:
`"has no retired copy (gratuit*, nunca expiram, Stripe, grátis fora do teste) in any component"`.

- [ ] **Step 2: testes da landing (falham)**

`PricingSection.test.tsx`: substituir o teste "renders the 7-day trial as invite-only" por

```ts
  it("renders the 7-day trial with card, pointing to /assinar?trial=1 and naming the plan that follows", () => {
    renderWithProviders(<PricingSection />);
    expect(screen.getByText("Teste grátis")).toBeInTheDocument();
    expect(screen.getByText(/7 dias · 50 créditos/)).toBeInTheDocument();
    expect(screen.getByText(/Cartão obrigatório\. Nada é cobrado por 7 dias/)).toBeInTheDocument();
    expect(screen.getByText(/Depois, R\$\s*39,90\/mês \(300 créditos\)\. Cancele antes e não paga nada\./)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Testar 7 dias grátis/i })).toHaveAttribute("href", "/assinar?trial=1");
    expect(screen.queryByText(/convite/i)).toBeNull();
    expect(screen.queryByRole("link", { name: /mailto/ })).toBeNull();
    expect(document.querySelector('a[href^="mailto:"]')).toBeNull();
  });

  it("follows the catalogue for the plan after the trial", () => {
    mockUsePlans.mockReturnValue({
      data: [{ id: "x", slug: "unico", name: "Único", priceBrl: 42, monthlyCredits: 120, highlight: false, adminOnly: false }],
      isLoading: false,
    });
    renderWithProviders(<PricingSection />);
    expect(screen.getByText(/Depois, R\$\s*42,00\/mês \(120 créditos\)/)).toBeInTheDocument();
  });
```

No teste "renders the three monthly plans...", `39,90` agora aparece duas vezes (card do trial e
plano Básico): trocar `getByText(/R\$\s*39,90/)` por `expect(screen.getAllByText(/R\$\s*39,90/).length).toBe(2)`.

`FaqSection.test.tsx`: abrir o arquivo, seguir o padrão dos testes existentes (clicar na pergunta
e ler o painel) e acrescentar:

```ts
  it("explains the 7-day trial with card and the cancel rule inside it", async () => {
    const user = userEvent.setup();
    renderWithProviders(<FaqSection />);
    await user.click(screen.getByRole("button", { name: "Como funciona o teste grátis de 7 dias?" }));
    expect(screen.getByText(/cartão de crédito/i)).toBeInTheDocument();
    expect(screen.getByText(/No 8º dia cobramos R\$ 39,90/)).toBeInTheDocument();
    expect(screen.getByText(/um teste por CPF/i)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Posso cancelar quando quiser?" }));
    expect(screen.getByText(/Durante o teste grátis, cancelar encerra o acesso na hora/)).toBeInTheDocument();
  });
```

- [ ] **Step 3: rodar e ver falhar**

Run: `docker compose exec app npx vitest run src/components/landing src/test/copyGuard.test.ts`
Expected: FAIL nos dois arquivos da landing (copy antiga).

- [ ] **Step 4: implementar**

`PricingSection.tsx`: remover o import de `SUPPORT_EMAIL`; importar `cheapestPublicPlan`,
`TRIAL_CREDITS`, `TRIAL_DAYS`; `const trialPlan = useMemo(() => cheapestPublicPlan(plans), [plans]);`
(`plans` já cai em `DEFAULT_PLANS`, então nunca é nulo aqui; tratar `null` mesmo assim). O card:

```tsx
          {/* Trial with card: 7 days free on the cheapest plan (spec 2026-09-15) */}
          <div className="bg-card rounded-xl border border-border shadow-card p-6 flex flex-col">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Para conhecer</p>
            <p className="text-2xl font-extrabold text-foreground mb-1">Teste grátis</p>
            <p className="text-sm text-muted-foreground mb-4">{TRIAL_DAYS} dias · {TRIAL_CREDITS} créditos</p>
            <ul className="space-y-2 text-sm text-foreground flex-1 mb-4">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                {TRIAL_CREDITS} créditos para experimentar
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                Acesso a todas as funcionalidades
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                Cartão obrigatório. Nada é cobrado por {TRIAL_DAYS} dias.
              </li>
            </ul>
            {trialPlan && (
              <p className="text-xs text-muted-foreground mb-4">
                Depois, {formatBrl(trialPlan.priceBrl)}/mês ({trialPlan.monthlyCredits} créditos). Cancele antes e não paga nada.
              </p>
            )}
            <Link to="/assinar?trial=1">
              <Button variant="outline" className="w-full">Testar {TRIAL_DAYS} dias grátis</Button>
            </Link>
          </div>
```

(Cada linha com "grátis" contém "Teste"/"Testar", o que satisfaz a guarda.)

`FaqSection.tsx`: inserir depois de "Como funciona a assinatura?":

```ts
  {
    q: "Como funciona o teste grátis de 7 dias?",
    a: "Você informa nome, e-mail e um cartão de crédito. O cartão é validado (uma cobrança simbólica pode aparecer e é estornada), nada é cobrado por 7 dias e você recebe 50 créditos para experimentar tudo. No 8º dia cobramos R$ 39,90 e sua conta vira o plano Básico, com 300 créditos por mês. Cancelou antes do 8º dia? Nada é cobrado e o acesso encerra na hora. É um teste por CPF.",
  },
```

e a resposta de "Posso cancelar quando quiser?" vira:

```ts
    a: "Sim, em Créditos, com um clique. Você não é mais cobrado e continua usando os créditos do plano até o fim do período já pago. Os extras continuam com você. Durante o teste grátis, cancelar encerra o acesso na hora e nada é cobrado.",
```

- [ ] **Step 5: rodar**

Run: `docker compose exec app npx vitest run src/components/landing src/test/copyGuard.test.ts`
Expected: PASS.

- [ ] **Step 6: commit (com aprovação)**

```bash
git add src/test/copyGuard.test.ts src/components/landing/PricingSection.tsx src/components/landing/PricingSection.test.tsx src/components/landing/FaqSection.tsx src/components/landing/FaqSection.test.tsx
git commit -m "feat(landing): card Teste grátis com cartão leva a /assinar?trial=1; FAQ explica o teste"
```

(O diff pendente de `LandingFooter.tsx`/`.test.tsx` no working tree, que tira o e-mail do rodapé,
entra neste mesmo commit: `git add src/components/landing/LandingFooter.tsx src/components/landing/LandingFooter.test.tsx`.)

---

### Task 10: `SubscribePage?trial=1`

**Files:**
- Modify: `src/pages/SubscribePage.tsx`
- Test: `src/pages/SubscribePage.test.tsx`

**Interfaces:**
- Consumes: `useSubscribe` com `trial`, `subscribeErrorCode`, `SubscribeResult.trialEndsAt` (Task 7);
  `cheapestPublicPlan`, `trialFirstChargeDate`, `TRIAL_CREDITS`, `TRIAL_DAYS`, `formatDate`,
  `formatBrl` (Task 8); `MpCardBrick.submitLabel` (Task 8); `trackTrialStarted` (Task 7);
  `parseIsoOrNull` (`@/lib/domain/access`).

- [ ] **Step 1: testes (falham)**

Em `SubscribePage.test.tsx`, novo bloco:

```ts
describe("SubscribePage (trial with card, ?trial=1)", () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    mockUsePlans.mockReturnValue({ data: PLANS, isLoading: false });
    mockUseSubscription.mockReturnValue({ data: undefined });
    mockSignInWithOtp.mockResolvedValue({ error: null });
    await setAnonymous();
  });

  it("locks the cheapest plan, shows the first-charge date and labels the Brick button", async () => {
    const user = userEvent.setup();
    renderPage("/assinar?trial=1");
    expect(screen.getByRole("heading", { level: 1, name: "Teste grátis por 7 dias" })).toBeInTheDocument();
    await fillAccount(user);
    expect(screen.queryByRole("group", { name: "Planos" })).toBeNull();
    expect(screen.getByText(/Plano Básico · R\$\s*39,90\/mês · 300 créditos por mês/)).toBeInTheDocument();
    const expected = trialFirstChargeDate(new Date());
    expect(screen.getByRole("note")).toHaveTextContent(`Hoje: R$ 0,00. Em ${formatDate(expected)} cobramos R$ 39,90 no cartão e seu plano vira 300 créditos/mês.`);
    expect(screen.getByRole("note")).toHaveTextContent(/Cancele antes em Créditos e nada é cobrado\. Uma cobrança de validação pode aparecer e é estornada\./);
    expect(brickProps).toHaveBeenCalledWith(expect.objectContaining({ amount: 39.9, payerEmail: "nova@example.com", submitLabel: "Começar o teste" }));
  });

  it("sends trial: true with the account and, when authorized, mails the login link with the trial copy", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockResolvedValue({ status: "authorized", subscriptionId: "sub-1", accountCreated: true, trialEndsAt: "2026-09-22T21:52:15.000Z" });
    window.dataLayer = [];
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Teste ativado! 50 créditos já estão na sua conta."));
    expect(screen.getByRole("status")).toHaveTextContent(`A primeira cobrança de R$ 39,90 será em ${formatDate(new Date("2026-09-22T21:52:15.000Z"))}.`);
    expect(mockSubscribe).toHaveBeenCalledWith({
      planSlug: "basico",
      card: CARD,
      trial: true,
      account: { fullName: "Nova Pessoa", email: "nova@example.com", termsVersion: TERMS_VERSION },
    });
    expect(mockSignInWithOtp).toHaveBeenCalledWith(expect.objectContaining({ email: "nova@example.com" }));
    expect(window.dataLayer.some((e) => (e as { event: string }).event === "trial_started")).toBe(true);
    expect(window.dataLayer.some((e) => (e as { event: string }).event === "subscription_started")).toBe(false);
  });

  it("on trial_used offers the paid plan with the same card, without a new token", async () => {
    const user = userEvent.setup();
    mockSubscribe
      .mockRejectedValueOnce(Object.assign(new Error("Este CPF já usou o teste."), { code: "trial_used" }))
      .mockResolvedValueOnce({ status: "authorized", subscriptionId: "sub-2", accountCreated: true });
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));

    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Este CPF já usou o teste."));
    expect(screen.queryByTestId("card-brick")).toBeNull();
    await user.click(screen.getByRole("button", { name: "Assinar R$ 39,90/mês" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent(/Assinatura ativa! 300 créditos/));
    expect(mockSubscribe).toHaveBeenLastCalledWith(expect.objectContaining({ planSlug: "basico", card: CARD }));
    expect(mockSubscribe.mock.calls[1][0]).not.toHaveProperty("trial");
  });

  it("lets the buyer try another card after trial_used", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValueOnce(Object.assign(new Error("Este CPF já usou o teste."), { code: "trial_used" }));
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("Este CPF já usou o teste."));
    await user.click(screen.getByRole("button", { name: "Usar outro cartão" }));
    expect(screen.getByTestId("card-brick")).toBeInTheDocument();
  });

  it("hands other refusals back to the Brick as before", async () => {
    const user = userEvent.setup();
    mockSubscribe.mockRejectedValueOnce(Object.assign(new Error("Muitas tentativas."), { code: "rate_limited" }));
    renderPage("/assinar?trial=1");
    await fillAccount(user);
    await user.click(screen.getByRole("button", { name: "Assinar agora" }));
    await waitFor(() => expect(brickProps).toHaveBeenCalledWith("rejected"));
  });

  it("ignores ?trial=1 for a logged-in user (paid flow, plan selector visible)", async () => {
    await setProfile(LEGACY);
    renderPage("/assinar?trial=1");
    expect(screen.getByRole("heading", { level: 1, name: "Assinar um plano" })).toBeInTheDocument();
    expect(screen.getByRole("group", { name: "Planos" })).toBeInTheDocument();
    expect(brickProps).toHaveBeenCalledWith(expect.not.objectContaining({ submitLabel: expect.anything() }));
  });
});
```

Imports: `formatDate` de `@/lib/domain/subscriptionUi` (já exportado).

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run src/pages/SubscribePage.test.tsx`
Expected: FAIL (título, nota, `trial` no payload).

- [ ] **Step 3: implementar**

Em `SubscribePage.tsx`:

Imports novos:

```ts
import { parseIsoOrNull } from "@/lib/domain/access";
import { isLiveSubscription, subscribeErrorCode, usePlans, useSubscribe, useSubscription, type PlanView, type SubscribeResult } from "@/hooks/useSubscription";
import { canSubscribe, cheapestPublicPlan, formatBrl, formatDate, pickInitialPlan, replacementNotice, TERMS_VERSION, TRIAL_CREDITS, TRIAL_DAYS, trialFirstChargeDate } from "@/lib/domain/subscriptionUi";
import { trackAddPaymentInfo, trackBeginCheckout, trackSubscriptionStarted, trackTrialStarted } from "@/lib/analytics/events";
```

`Stage` ganha:

```ts
  /** The CPF already had a trial: same card, paid plan, one click (no new token: MP was never called). */
  | { kind: "trial_used"; plan: PlanView; card: CardFormDataView; message: string }
```

Seleção do plano:

```ts
  const requested = params.get("plano");
  // ?trial=1 is the landing's trial CTA: anonymous only (a logged-in user
  // subscribes paid); the plan is the cheapest public one, decided again by the
  // server, and the selector is hidden.
  const trialMode = anonymous && params.get("trial") === "1";
  const selected = useMemo(
    () => (trialMode ? cheapestPublicPlan(plans) : plans.find((p) => p.slug === selectedSlug) ?? pickInitialPlan(plans, requested)),
    [plans, selectedSlug, requested, trialMode],
  );
```

`handleSubmit`:

```ts
  // A rejected promise hands the failure back to the Brick, which re-enables
  // its button (business refusals were already toasted by the hook), except
  // trial_used, which this page answers inline.
  async function handleSubmit(plan: PlanView, card: CardFormDataView, trial: boolean) {
    trackAddPaymentInfo(plan);
    const attribution = readAttribution(sessionStore());
    let result: SubscribeResult;
    try {
      result = await subscribe.mutateAsync({
        planSlug: plan.slug,
        card,
        ...(trial ? { trial: true } : {}),
        ...(anonymous && account ? { account: { ...account, termsVersion: TERMS_VERSION } } : {}),
        ...(attribution ? { attribution: attribution as Record<string, unknown> } : {}),
      });
    } catch (e) {
      if (trial && subscribeErrorCode(e) === "trial_used") {
        setStage({ kind: "trial_used", plan, card, message: (e as Error).message });
        return;
      }
      throw e;
    }
    if (result.status !== "rejected") {
      if (trial) trackTrialStarted(plan, result.subscriptionId, result.status);
      else trackSubscriptionStarted(plan, result.subscriptionId, result.status);
    }
    const firstCharge = parseIsoOrNull(result.trialEndsAt);

    if (result.accountCreated) {
      const email = account!.email;
      const mailSent = await sendLoginLink(email);
      const tone = result.status === "authorized" ? "success" : result.status === "pending" ? "pending" : "rejected";
      const message =
        tone === "success"
          ? trial
            ? `Teste ativado! ${TRIAL_CREDITS} créditos já estão na sua conta. A primeira cobrança de ${formatBrl(plan.priceBrl)} será em ${firstCharge ? formatDate(firstCharge) : `${TRIAL_DAYS} dias`}.`
            : `Assinatura ativa! ${plan.monthlyCredits} créditos já estão na sua conta.`
          : tone === "pending"
            ? trial
              ? "Teste em análise. Seus créditos entram assim que o cartão for confirmado."
              : "Assinatura em análise. Seus créditos entram assim que o cartão for confirmado."
            : (result.message ?? GENERIC_REJECTION);
      setStage({ kind: "new_account", tone, message, email, mailSent });
      return;
    }
    ...resto igual...
  }
```

Cabeçalho da página (dentro do `return` principal):

```tsx
      <header className="space-y-1">
        <h1 className="text-2xl font-bold text-foreground">{trialMode ? `Teste grátis por ${TRIAL_DAYS} dias` : "Assinar um plano"}</h1>
        <p className="text-sm text-muted-foreground">
          {trialMode
            ? `Cartão obrigatório, nada é cobrado hoje. Em ${TRIAL_DAYS} dias começa o plano${selected ? ` ${selected.name} (${formatBrl(selected.priceBrl)}/mês)` : ""}. Cancele antes e não paga nada.`
            : "Créditos novos todo mês, cobrados no cartão em 1x. Cancele quando quiser."}
        </p>
      </header>
```

Card de `trial_used` (ao lado dos outros cards de estágio):

```tsx
      {stage.kind === "trial_used" && (
        <Card className="border-amber-300 bg-amber-50">
          <CardContent className="p-6 space-y-3">
            <p role="status" aria-live="polite" className="text-sm text-amber-900">
              {stage.message} Você pode assinar o plano {stage.plan.name} por {formatBrl(stage.plan.priceBrl)}/mês com o mesmo cartão, sem digitar nada de novo.
            </p>
            <div className="flex flex-wrap gap-2">
              <Button onClick={() => handleSubmit(stage.plan, stage.card, false)} disabled={subscribe.isPending}>
                Assinar {formatBrl(stage.plan.priceBrl)}/mês
              </Button>
              <Button variant="outline" onClick={retry}>Usar outro cartão</Button>
            </div>
          </CardContent>
        </Card>
      )}
```

Seção de planos: envolver com `{!trialMode && ( <section ...> ... </section> )}` e, no modo trial,
mostrar o plano travado:

```tsx
          {trialMode && selected && (
            <p className="text-sm text-muted-foreground">
              Plano {selected.name} · {formatBrl(selected.priceBrl)}/mês · {selected.monthlyCredits} créditos por mês, a partir do 8º dia.
            </p>
          )}
```

Card do cartão: título `trialMode ? "Cartão de crédito" : \`Pagar ${formatBrl(selected.priceBrl)} por mês no cartão\``;
antes do `<MpCardBrick>`, no modo trial:

```tsx
                {trialMode && (
                  <p role="note" className="text-sm rounded-md bg-primary/5 text-foreground px-3 py-2">
                    Hoje: R$ 0,00. Em {formatDate(trialFirstChargeDate(new Date()))} cobramos {formatBrl(selected.priceBrl)} no cartão e seu plano vira {selected.monthlyCredits} créditos/mês. Cancele antes em Créditos e nada é cobrado. Uma cobrança de validação pode aparecer e é estornada.
                  </p>
                )}
```

`<MpCardBrick ... onSubmit={(card) => handleSubmit(selected, card, trialMode)} {...(trialMode ? { submitLabel: "Começar o teste" } : {})} />`
e o rodapé do card:

```tsx
                <p className="text-xs text-muted-foreground">
                  {trialMode
                    ? `Você recebe ${TRIAL_CREDITS} créditos agora. A cobrança só acontece em ${TRIAL_DAYS} dias, e depois todo mês na mesma data.`
                    : "A primeira cobrança é feita agora e as próximas todo mês na mesma data. Os créditos do plano zeram a cada renovação; os extras não expiram."}
                </p>
```

(`replacementNotice` continua só fora do trial: `access` é nulo para anônimo.)

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run src/pages/SubscribePage.test.tsx src/test/copyGuard.test.ts`
Expected: PASS (inclusive os testes antigos do funil pago, que não mudam).

- [ ] **Step 5: commit (com aprovação)**

```bash
git add src/pages/SubscribePage.tsx src/pages/SubscribePage.test.tsx
git commit -m "feat(assinatura): /assinar?trial=1 começa o teste de 7 dias com cartão"
```

---

### Task 11: `SubscriptionCard` e `AccessBanner` no trial com cartão

**Files:**
- Modify: `src/components/credits/SubscriptionCard.tsx`
- Test: `src/components/credits/SubscriptionCard.test.tsx`
- Modify: `src/components/common/AccessBanner.tsx`
- Test: `src/components/common/AccessBanner.test.tsx`

**Interfaces:**
- Consumes: `isCardTrial`, `formatBrl`, `formatDate`, `TRIAL_DAYS` (Task 8); `useCancelSubscription({ trial })` (Task 7).

- [ ] **Step 1: testes (falham)**

`SubscriptionCard.test.tsx` (usar os helpers `access()`/`sub()` do arquivo; `sub()` já deve incluir
`trialEndsAt: null` desde a Task 7):

```ts
describe("SubscriptionCard (trial with card)", () => {
  const trialSub = () => sub({
    status: "authorized",
    plan: { ...PLAN, slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false },
    firstPaymentConfirmed: false,
    trialEndsAt: new Date("2026-09-22T12:00:00Z"),
    nextPaymentDate: new Date("2026-09-22T12:00:00Z"),
    cardBrand: "visa",
    cardLastFour: "5682",
  });
  const trialAccess = () => access({ kind: "trial", planCredits: 42, total: 47, periodEnd: new Date("2026-09-22T12:00:00Z"), daysLeft: 7 });

  it("shows the trial, the first charge and the immediate consequence of cancelling", () => {
    renderWithProviders(<SubscriptionCard subscription={trialSub()} access={trialAccess()} />);
    expect(screen.getByText("Teste grátis")).toBeInTheDocument();
    expect(screen.getByText(/depois Básico · R\$\s*39,90\/mês/)).toBeInTheDocument();
    expect(screen.getByText("Primeira cobrança")).toBeInTheDocument();
    expect(screen.getByText("22/09/2026")).toBeInTheDocument();
    expect(screen.getByText(/42 créditos do teste até 22\/09\/2026\. Cancelar agora encerra o acesso na hora e nada é cobrado\./)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Cancelar teste" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Trocar cartão/ })).toBeInTheDocument();
  });

  it("confirms the trial cancellation with its own copy and cancels", async () => {
    const user = userEvent.setup();
    renderWithProviders(<SubscriptionCard subscription={trialSub()} access={trialAccess()} />);
    await user.click(screen.getByRole("button", { name: "Cancelar teste" }));
    const dialog = screen.getByRole("alertdialog");
    expect(dialog).toHaveTextContent("Cancelar o teste?");
    expect(dialog).toHaveTextContent(/Nada será cobrado\. Seus créditos do teste são removidos na hora; os extras não expiram\./);
    await user.click(within(dialog).getByRole("button", { name: "Cancelar teste" }));
    expect(mockCancel).toHaveBeenCalled();
  });
});
```

O `vi.mock` de `useCancelSubscription` precisa registrar o argumento para o teste seguinte:
trocar por `useCancelSubscription: (opts?: unknown) => { cancelOpts(opts); return { mutate: mockCancel, isPending: false }; }`
com `cancelOpts` no `vi.hoisted`, e acrescentar ao 2º teste acima: `expect(cancelOpts).toHaveBeenCalledWith({ trial: true });`.
No teste existente de cancelamento pago, acrescentar `expect(cancelOpts).toHaveBeenCalledWith({ trial: false });`.

`AccessBanner.test.tsx`:

```ts
  it("names the first charge of a trial with card", () => {
    render(
      <MemoryRouter>
        <AccessBanner
          now={NOW}
          access={access({ kind: "trial", planCredits: 42, extraCredits: 0, total: 42, periodEnd: new Date("2026-09-21T12:00:00Z"), daysLeft: 7 })}
          subscription={subscription({
            firstPaymentConfirmed: false,
            trialEndsAt: new Date("2026-09-21T12:00:00Z"),
            plan: { id: "b", slug: "basico", name: "Básico", priceBrl: 39.9, monthlyCredits: 300, highlight: false, adminOnly: false },
          })}
        />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Teste grátis: 7 dias restantes e 42 créditos. Em 21/09/2026 cobramos R$ 39,90 no cartão.");
    expect(screen.getByRole("link", { name: "Ver detalhes" })).toHaveAttribute("href", "/creditos");
  });

  it("keeps the invite-trial banner when the trial has no card behind it", () => {
    render(
      <MemoryRouter>
        <AccessBanner now={NOW} access={access({ kind: "trial", planCredits: 42, total: 42, daysLeft: 3 })} subscription={null} />
      </MemoryRouter>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Período de teste: 3 dias restantes e 42 créditos para usar.");
  });
```

(Confirmar o texto do 2º teste com o já existente no arquivo; se houver um igual, não duplicar.)

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run src/components/credits/SubscriptionCard.test.tsx src/components/common/AccessBanner.test.tsx`
Expected: FAIL.

- [ ] **Step 3: implementar**

`SubscriptionCard.tsx`:

```ts
import { canSubscribe, formatBrl, formatCard, formatDate, isCardTrial } from "@/lib/domain/subscriptionUi";
...
export default function SubscriptionCard({ subscription, access, isSuperAdmin = false }: Props) {
  const { user } = useAuth();
  // Hooks run before the early returns; isCardTrial is false while loading.
  const cardTrial = isCardTrial(subscription);
  const cancel = useCancelSubscription({ trial: cardTrial });
```

Na parte "live": badge e `dl`:

```tsx
  const status = cardTrial ? { label: "Teste grátis", tone: "default" as const } : STATUS_LABELS[sub.status];
  ...
          <div>
            <dt className="text-muted-foreground">Plano</dt>
            <dd className="font-semibold">
              {cardTrial && sub.plan
                ? `Teste grátis · depois ${sub.plan.name} · ${formatBrl(sub.plan.priceBrl)}/mês`
                : sub.plan ? `${sub.plan.name} · ${formatBrl(sub.plan.priceBrl)}/mês` : "Plano"}
            </dd>
            {sub.plan && <dd className="text-xs text-muted-foreground">{sub.plan.monthlyCredits} créditos por mês</dd>}
          </div>
          <div>
            <dt className="text-muted-foreground">{cardTrial ? "Primeira cobrança" : "Próxima cobrança"}</dt>
            <dd className="font-semibold">
              {cardTrial && sub.trialEndsAt ? formatDate(sub.trialEndsAt) : sub.nextPaymentDate ? formatDate(sub.nextPaymentDate) : "a confirmar"}
            </dd>
          </div>
```

Depois do `dl` (antes do alerta de `past_due`):

```tsx
        {cardTrial && sub.trialEndsAt && (
          <p className="text-sm text-muted-foreground">
            Você tem {access.planCredits} {access.planCredits === 1 ? "crédito" : "créditos"} do teste até {formatDate(sub.trialEndsAt)}. Cancelar agora encerra o acesso na hora e nada é cobrado.
          </p>
        )}
```

Botão: `{cardTrial ? "Cancelar teste" : "Cancelar assinatura"}`. AlertDialog:

```tsx
            <AlertDialogTitle>{cardTrial ? "Cancelar o teste?" : "Cancelar a assinatura?"}</AlertDialogTitle>
            <AlertDialogDescription>
              {cardTrial ? (
                <>Nada será cobrado. Seus créditos do teste são removidos na hora; os extras não expiram.</>
              ) : (
                <>
                  Você não será mais cobrado. Seus créditos do plano continuam valendo até{" "}
                  {access.periodEnd ? formatDate(access.periodEnd) : "o fim do período pago"}; os extras não expiram.
                </>
              )}
            </AlertDialogDescription>
          ...
            <AlertDialogCancel>{cardTrial ? "Manter o teste" : "Manter assinatura"}</AlertDialogCancel>
            <AlertDialogAction onClick={() => cancel.mutate()}>{cardTrial ? "Cancelar teste" : "Cancelar assinatura"}</AlertDialogAction>
```

`AccessBanner.tsx`: importar `formatBrl, formatDate, isCardTrial, isRecentRejection` e inserir
**antes** do bloco `if (access.kind === "trial" && !access.trialExpired ...)`:

```tsx
  if (isCardTrial(subscription) && access.kind === "trial" && !access.trialExpired && access.daysLeft !== null) {
    const days = access.daysLeft;
    const sub = subscription!;
    const charge = sub.plan && sub.trialEndsAt ? ` Em ${formatDate(sub.trialEndsAt)} cobramos ${formatBrl(sub.plan.priceBrl)} no cartão.` : "";
    return (
      <div
        role="status"
        className="bg-primary/10 text-primary text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap"
      >
        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          Teste grátis: {days === 1 ? "1 dia restante" : `${days} dias restantes`} e{" "}
          {access.planCredits} {access.planCredits === 1 ? "crédito" : "créditos"}.{charge}
        </span>
        <Link to="/creditos" className="font-medium underline">
          Ver detalhes
        </Link>
      </div>
    );
  }
```

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run src/components/credits src/components/common src/test/copyGuard.test.ts`
Expected: PASS.

- [ ] **Step 5: commit (com aprovação)**

```bash
git add src/components/credits/SubscriptionCard.tsx src/components/credits/SubscriptionCard.test.tsx src/components/common/AccessBanner.tsx src/components/common/AccessBanner.test.tsx
git commit -m "feat(creditos): card e faixa de acesso mostram o teste com cartão e a data da primeira cobrança"
```

---

### Task 12: Termos de Uso: cláusula "Teste grátis"

**Files:**
- Modify: `src/lib/domain/legalDocs.ts:40-70`
- Test: `src/pages/LegalPage.test.tsx`

- [ ] **Step 1: teste (falha)**

```ts
  it("terms carry the trial clause and the current version", () => {
    const terms = LEGAL_DOCS.termos;
    const clause = terms.sections.find((s) => s.title === "4. Teste grátis");
    expect(clause).toBeDefined();
    expect(clause!.paragraphs.join(" ")).toMatch(/cartão de crédito válido/);
    expect(clause!.paragraphs.join(" ")).toMatch(/8º dia/);
    expect(clause!.paragraphs.join(" ")).toMatch(/um teste por CPF/);
    expect(terms.sections.map((s) => s.title)).toEqual([
      "1. O serviço", "2. Conta e acesso", "3. Planos, créditos e pagamento", "4. Teste grátis",
      "5. Cancelamento", "6. Uso aceitável", "7. Alterações",
    ]);
    expect(terms.sections.at(-1)!.paragraphs[0]).toContain(TERMS_VERSION);
  });
```

(importar `TERMS_VERSION` de `@/lib/domain/subscriptionUi`).

- [ ] **Step 2: rodar e ver falhar**

Run: `docker compose exec app npx vitest run src/pages/LegalPage.test.tsx`
Expected: FAIL.

- [ ] **Step 3: implementar**

Em `LEGAL_DOCS.termos.sections`, inserir após "3. Planos, créditos e pagamento" e renumerar as
seguintes (Cancelamento → 5, Uso aceitável → 6, Alterações → 7):

```ts
      {
        title: "4. Teste grátis",
        paragraphs: [
          "O teste grátis de 7 dias exige um cartão de crédito válido, que é verificado no cadastro (uma cobrança simbólica de validação pode aparecer e é estornada pela operadora). Durante o teste nada é cobrado e a conta recebe 50 créditos.",
          "No 8º dia, salvo cancelamento anterior em Créditos, o cartão é cobrado pelo plano mensal mais barato em vigor e a conta passa a ser uma assinatura comum, com renovação automática. Cancelar antes do 8º dia encerra o acesso aos créditos do teste na hora e nada é cobrado.",
          "É um teste por CPF: quem já usou o teste ou já teve uma assinatura só assina um plano pago.",
        ],
      },
```

Em "2. Conta e acesso", o 1º parágrafo passa a: "A conta é pessoal e nasce da assinatura de um
plano, do teste grátis com cartão ou de um convite da equipe. ..."

- [ ] **Step 4: rodar**

Run: `docker compose exec app npx vitest run src/pages/LegalPage.test.tsx`
Expected: PASS.

- [ ] **Step 5: commit (com aprovação)**

```bash
git add src/lib/domain/legalDocs.ts src/pages/LegalPage.test.tsx
git commit -m "docs(legal): Termos ganham a cláusula do teste grátis com cartão (versão 2026-09.2)"
```

---

### Task 13: documentação viva, `.env.example` e gates completos

**Files:**
- Modify: `.claude/skills/dominio-orientador/SKILL.md` (linha da Assinatura, gotcha "Assinatura (Fase 3)" e "Funil pagar-primeiro (Fase 4)", parágrafo de abertura "trial de 7 dias/50 créditos ou cortesia")
- Modify: `.claude/agents/edge-fn-writer.md:38` (descrição de `subscribeFlow.ts`)
- Modify: `.env.example` (bloco STAGING)
- Modify: `.claude/docs/environment.md` (bloco STAGING)
- Modify: `CLAUDE.md` (1º parágrafo: "conta nasce pelo checkout pago, pelo teste com cartão ou por convite do admin")
- Modify: `docs/superpowers/specs/2026-09-15-trial-com-cartao-e-estorno-design.md` (seção 12: registrar "rodada 1 implementada em <data>")

- [ ] **Step 1: `dominio-orientador`**

1. Parágrafo de abertura: "...contas nascem pelo checkout pago, pelo **teste grátis com cartão** (7 dias/50 créditos, `/assinar?trial=1`, cobra o plano mais barato no 8º dia) ou por convite do admin (trial sem cartão ou cortesia)".
2. Linha **Assinatura** da tabela: acrescentar "`/assinar?trial=1` (só anônimo)" e a RPC `trial_used_by_cpf`.
3. Gotcha novo, logo após "Funil pagar-primeiro (Fase 4)":

> - **Teste grátis com cartão (2026-09-15).** `subscribe` com `trial: true` (só anônimo; logado ⇒ 400 `trial_requires_new_account`): plano = mais barato ativo não `admin_only` (`loadCheapestPublicPlan`, nunca o `planSlug` do cliente), **um trial por CPF** via RPC `trial_used_by_cpf` checada **antes** do `createUser` (409 `trial_used`; CPF inválido ⇒ 400 `cpf_required`), e a linha de `subscriptions` nasce com **`trial_ends_at`** = `now + 7d` (o mesmo `auto_recurring.start_date` enviado ao MP; `reason` cortado em **60 chars**, limite do MP). **A linha carrega a intenção**: `activate_subscription` (mesma assinatura) ramifica pela coluna: 50 créditos no balde do plano até `trial_ends_at`, `access_kind = 'trial'`, sem cota, sem invoice `activation:`; o 1º `subscription_authorized_payment` aprovado vira `renew_subscription → trial_converted` (cota via `apply_plan_quota`, `subscriber`, período de 1 mês a partir do débito; o `mp-webhook` conta como `subscription_renewed`); recusado ⇒ `clawback`. `cancel_subscription_local` dentro do trial (`trial_ends_at` não nulo e `first_payment_confirmed = false`) **zera os créditos na hora** (`plan_reset`, `trial_closed: true`); fora dele, expiração preguiçosa como sempre. No cliente: `isCardTrial(sub)` (`lib/domain/subscriptionUi.ts`) muda `SubscriptionCard`, `AccessBanner` e o toast do `useCancelSubscription({ trial })`; `trial_used` volta com `code` (`parseInvokeFailure`) e a `SubscribePage` oferece o plano pago com o mesmo cartão (o token não foi consumido: o servidor recusou antes de falar com o MP). O pagamento `card_validation` (R$ 0,00 no sandbox) não tem `external_reference` de compra e é ignorado pelo webhook. Sandbox: Visa `4235 6477 2802 5682` (a Master `5031 4332…` é recusada para recorrência) e comprador `BUYER_TEST_EMAIL_MP`. Cobertura: pgTAP `trial_with_card.test.sql`; `subscribeFlow.test.ts`, `accountProvision.test.ts`.

4. Na frase da guarda de copy: "(gratuit*, nunca expiram, Stripe; `grátis` só numa linha com teste/testar)".

- [ ] **Step 2: `edge-fn-writer.md`**

Linha 38: `subscribeFlow.ts # runSubscribe(input, deps): plano válido (ou o mais barato no trial), uma viva, trial_ends_at na linha, ativação otimista, pending, recusa, nunca repetir o POST`.

- [ ] **Step 3: `.env.example` e `environment.md`**

`.env.example`, após `PASSWORD_TEST_MP=`:

```bash
# Comprador de teste MLB (criado em 2026-09-15 via POST /users/test_user): o payer_email das
# assinaturas no sandbox precisa ser um usuário de teste real do mesmo site.
BUYER_TEST_EMAIL_MP=
```

`environment.md`, no parágrafo do bloco STAGING: acrescentar "e `BUYER_TEST_EMAIL_MP`, o comprador de
teste usado como e-mail da conta no funil anônimo do sandbox (o link de acesso cai no Mailpit local)".

- [ ] **Step 4: `CLAUDE.md` e spec**

`CLAUDE.md`, 1º parágrafo: "Sem cadastro público nem adaptação grátis: conta nasce pelo checkout
pago, pelo teste de 7 dias com cartão (sem cobrança até o 8º dia) ou por convite do admin (trial 7
dias/50 créditos)". Spec, seção 12: acrescentar a linha "Rodada 1 implementada em <data> (commits
na `main`)".

- [ ] **Step 5: gates completos**

Run: `make lint && make test && make typecheck-app && make fn-check && make test-db`
Expected: lint limpo; Vitest 100% em statements/branches/functions/lines (se cair, `npm run
test:coverage` no container e ler o lcov para achar a linha; nunca baixar o threshold);
`typecheck-app` sem erro novo (é advisory; comparar com a saída antes das mudanças); `fn-check` e
pgTAP verdes.

- [ ] **Step 6: commit (com aprovação)**

```bash
git add .claude/skills/dominio-orientador/SKILL.md .claude/agents/edge-fn-writer.md .env.example .claude/docs/environment.md CLAUDE.md docs/superpowers/specs/2026-09-15-trial-com-cartao-e-estorno-design.md docs/superpowers/plans/2026-09-15-trial-com-cartao.md
git commit -m "docs: spec, plano e documentação viva do teste grátis com cartão"
```

---

### Task 14: validação em sandbox (com o dono) e runbook de deploy

Sem código. Roda **antes** de qualquer push (push = deploy).

- [ ] **Step 1: subir o ambiente apontando pro sandbox**

1. `.env.local` efêmero (gitignored; apagar no fim): `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY`
   do `make sb-status` (local) e `VITE_MP_PUBLIC_KEY=<valor de PUBLIC_KEY_MP>` (a public key de
   TESTE, par do `ACCESS_TOKEN_MP` que o `fn-serve-mp-test` injeta como `ACCESS_TOKEN_MP_PROD`).
2. `make fn-serve-mp-test` num terminal; `make dev` noutro.

- [ ] **Step 2: o fluxo feliz**

1. `http://localhost:8080/assinar?trial=1`: nome qualquer, e-mail = `BUYER_TEST_EMAIL_MP` (o
   payer precisa ser usuário de teste MLB), aceitar os termos; Visa `4235 6477 2802 5682`, 11/30,
   CVV 123, titular `APRO`, CPF `12345678909`; botão "Começar o teste".
2. Esperado na tela: "Teste ativado! 50 créditos..." com a data de D+7; e-mail de acesso no
   Mailpit local (`http://localhost:54324`).
3. Banco (`psql` local): `subscriptions` com `status = 'authorized'`, `trial_ends_at` = D+7,
   `first_payment_confirmed = false`; `profiles` com `access_kind = 'trial'`, `plan_credits = 50`,
   `plan_period_end = trial_ends_at`, `cpf = '12345678909'`; ledger com `trial_grant` 50.
4. MP: `GET /preapproval/{id}` com `ACCESS_TOKEN_MP`: `status authorized`, `next_payment_date` =
   `start_date`; `GET /authorized_payments/search?preapproval_id=` vazio.
5. Entrar pelo link do Mailpit → `/definir-senha` → Créditos: card "Teste grátis", "Primeira
   cobrança" na data certa, faixa "Teste grátis: 7 dias restantes...".

- [ ] **Step 3: as recusas**

1. Repetir o checkout com outro e-mail (qualquer `@testuser.com` de teste MLB não serve: usar o
   mesmo comprador) e o **mesmo CPF** ⇒ "Este CPF já usou o teste." e o botão "Assinar R$ 39,90/mês"
   (o e-mail do comprador já existe, então esse caminho vai dar `email_exists`; o ponto a validar
   é a mensagem do `trial_used` aparecer antes de criar conta, conferindo no banco que nenhuma
   `auth.users` nova nasceu).
2. Logado, abrir `/assinar?trial=1` ⇒ página de assinatura paga normal.

- [ ] **Step 4: cancelar dentro do teste**

Em Créditos, "Cancelar teste" ⇒ toast "Teste cancelado. Nada foi cobrado."; `profiles.plan_credits = 0`,
`plan_period_end <= now()`, `subscriptions.status = 'cancelled'`; no MP, o preapproval `cancelled`.
Faixa "Seu período de teste terminou" e card "Cancelada" com "Assinar um plano".

- [ ] **Step 5: limpeza**

`rm -f .env.local`; parar `fn-serve`/`dev`. Cancelar no MP o preapproval do spike de 2026-09-15
(`48cada46fb9a4cc79862003c314cff8a`) **depois** de 22/09, quando a cobrança do 8º dia tiver sido
observada em `authorized_payments/search` (registrar o resultado na seção 13 do spec).

- [ ] **Step 6: runbook de deploy (só com o dono)**

1. `git push origin main` ⇒ o CI aplica a migration e publica `subscribe` e `mp-webhook`.
2. Nenhum secret novo no remoto (`BUYER_TEST_EMAIL_MP` é só local).
3. Smoke em produção: não há como testar o trial sem um cartão real; o dono decide se roda um
   trial real com cartão próprio (cancelar antes do 8º dia ⇒ R$ 0,00) ou se confia no sandbox.
4. Observar em produção o 1º `subscription_authorized_payment` de um trial (D+8) nos logs do
   `mp-webhook`: `result: trial_converted`.

---

## Self-review

**Cobertura do spec (rodada 1):**
- §1 objetivo 1 (card cria a assinatura com cartão, sem cobrança por 7 dias): Tasks 1, 2, 4, 6, 9, 10.
- §1 objetivo 2 (nenhum e-mail de contato no site; convite continua fora do site): Task 9 (card sem
  `mailto`, `LandingFooter` já sem e-mail). O `SUPPORT_EMAIL` no menu da conta e na Privacidade fica
  (pendência do dono, §13).
- §2 decisão 1 (50 créditos, 8º dia cobra R$ 39,90, cota vira 300): Task 1 (`activate` / `trial_converted`).
- §2 decisão 3 (cancelar no trial = paywall imediato): Task 1 (`cancel_subscription_local`), Task 7 (toast), Task 11 (diálogo).
- §2 decisão 4 (um trial por CPF): Tasks 1 (`trial_used_by_cpf`), 5, 6, 10 (`trial_used` inline).
- §2 decisão 6 / §7 (onde explicar): card (Task 9), FAQ (Task 9), `/assinar?trial=1` com a data
  (Task 10), Créditos (Task 11), Termos (Task 12). Faixa do `Layout` (Task 11).
- §3 (mecanismo `start_date`, `reason` ≤ 60, cartão/comprador de sandbox): Tasks 2, 13, 14.
- §4 (`subscriptions.trial_ends_at`): Task 1. `refunded_at`/`mp_refund_id`/índice: rodada 2.
- §5 (`trial_used_by_cpf`, `activate`, `renew`, `cancel`): Task 1. `refund_last_charge`/`confirm_refund`: rodada 2.
- §6 `subscribe` (trial só anônimo, plano mais barato, CPF antes do createUser, conta nasce
  `subscriber`, `start_date`, `trialEndsAt`, `trial_started`): Tasks 3 a 6. `refund-last-charge`: rodada 2.
- §7 front: `PricingSection`/`FaqSection` (9), `SubscribePage` (10), `SubscriptionCard`/`Layout`
  (11), extrato `refund_clawback` e `useRefundLastCharge`: rodada 2.
- §8 Termos: Task 12. Reembolso/Privacidade: rodada 2 / pendente.
- §9 Admin: rodada 2.
- §10 segurança: plano e `start_date` no servidor (Task 4), CPF antes da conta (Task 5), nenhum
  crédito antes do `authorized` (Task 1: a conta nasce `subscriber` sem créditos; o trigger de
  confirmação não dispara para `subscriber`).
- §11 testes: pgTAP `trial_with_card.test.sql` (Task 1); Vitest em cada task; sandbox (Task 14).

**Placeholders:** nenhum "TBD/TODO"; todo passo de código traz o código. O único passo aberto por
natureza é a Task 14 (validação manual com o dono).

**Consistência de nomes:** `trial_ends_at` (coluna) ↔ `trialEndsAt` (deps, resultado, JSON, view);
`loadCheapestPublicPlan` (deps) ↔ `cheapestPublicPlan` (UI, mesma regra); `TRIAL_DAYS` existe nos
dois lados (`_shared/mpPreapproval.ts` e `lib/domain/subscriptionUi.ts`, como `adaptationCost.ts`
já faz com a constante duplicada; sem sync test porque o valor só alimenta copy no cliente);
`trial_converted` (RPC) ↔ `mp-webhook` (analytics); `subscribeErrorCode` (hook) ↔ `SubscribePage`;
`useCancelSubscription({ trial })` (hook) ↔ `SubscriptionCard`.
