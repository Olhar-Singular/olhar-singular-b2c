-- =============================================================================
-- pgTAP: approve_purchase_and_grant / reject_pending_purchase
-- -----------------------------------------------------------------------------
-- Both the Mercado Pago webhook and the synchronous card checkout used to do
-- the same two steps from the edge function: UPDATE credit_purchases
-- pending -> approved (the idempotency claim) and THEN rpc grant_credits. An
-- isolate dying between the two left a purchase marked approved with no ledger
-- row and no balance, and the next webhook saw 0 rows on the claim and assumed
-- the credit had already been granted. Production already has one Stripe
-- payment in exactly that state.
--
-- The claim and the grant now happen in ONE transaction inside the database, so
-- either both land or neither does, and every caller (webhook, card checkout)
-- shares the same idempotent path.
-- =============================================================================
BEGIN;
SELECT plan(16);

-- ── Fixtures ────────────────────────────────────────────────────────────────
INSERT INTO auth.users (id, email) VALUES
  ('b1111111-1111-1111-1111-111111111111', 'buyer@test.com');
UPDATE public.profiles SET credit_balance = 10
 WHERE id = 'b1111111-1111-1111-1111-111111111111';

INSERT INTO public.credit_purchases (id, user_id, amount_brl, credits_granted, status, provider, payment_method)
VALUES
  ('c0000000-0000-0000-0000-000000000001', 'b1111111-1111-1111-1111-111111111111', 29.90, 120, 'pending', 'mercadopago', 'card'),
  ('c0000000-0000-0000-0000-000000000002', 'b1111111-1111-1111-1111-111111111111', 9.90,  30,  'pending', 'mercadopago', 'card'),
  ('c0000000-0000-0000-0000-000000000003', 'b1111111-1111-1111-1111-111111111111', 9.90,  30,  'approved', 'mercadopago', 'pix');

-- ── Approve: claim + grant in one transaction ───────────────────────────────
SELECT is(
  (SELECT (public.approve_purchase_and_grant(
     'c0000000-0000-0000-0000-000000000001', 'mp-100') ->> 'granted')::boolean),
  true, 'a pending purchase is approved and its credits granted');

SELECT is(
  (SELECT status FROM public.credit_purchases WHERE id = 'c0000000-0000-0000-0000-000000000001'),
  'approved', 'the purchase row is now approved');

SELECT is(
  (SELECT payment_id FROM public.credit_purchases WHERE id = 'c0000000-0000-0000-0000-000000000001'),
  'mp-100', 'the MP payment id is stored on the purchase');

SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  130, 'the balance received exactly the purchased credits (10 + 120)');

SELECT is(
  (SELECT count(*)::int FROM public.credit_transactions
     WHERE user_id = 'b1111111-1111-1111-1111-111111111111'
       AND type = 'purchase' AND delta = 120
       AND payment_id = 'mp-100'
       AND ref_id = 'c0000000-0000-0000-0000-000000000001'),
  1, 'one purchase ledger row ties the grant to the payment and the purchase');

SELECT is(
  (SELECT public.approve_purchase_and_grant(
     'c0000000-0000-0000-0000-000000000001', 'mp-100') ->> 'reason'),
  'already_processed', 'a replayed approval is a no-op that says so');

SELECT is(
  (SELECT credit_balance FROM public.profiles WHERE id = 'b1111111-1111-1111-1111-111111111111'),
  130, 'the replay did not grant a second time');

SELECT is(
  (SELECT public.approve_purchase_and_grant(
     'c0000000-0000-0000-0000-000000000099', 'mp-404') ->> 'reason'),
  'already_processed', 'an unknown purchase is treated like an already-processed one');

-- ── Reject: closes a pending purchase with the MP detail ────────────────────
SELECT is(
  (SELECT (public.reject_pending_purchase(
     'c0000000-0000-0000-0000-000000000002', 'mp-200', 'cc_rejected_insufficient_amount') ->> 'rejected')::boolean),
  true, 'a pending purchase is rejected');

SELECT results_eq(
  $$ SELECT status, payment_id, status_detail FROM public.credit_purchases
      WHERE id = 'c0000000-0000-0000-0000-000000000002' $$,
  $$ VALUES ('rejected'::text, 'mp-200'::text, 'cc_rejected_insufficient_amount'::text) $$,
  'status, payment id and detail are recorded on the rejection');

SELECT is(
  (SELECT (public.reject_pending_purchase(
     'c0000000-0000-0000-0000-000000000003', 'mp-300', 'expired') ->> 'rejected')::boolean),
  false, 'an approved purchase can never be downgraded to rejected');

SELECT is(
  (SELECT status FROM public.credit_purchases WHERE id = 'c0000000-0000-0000-0000-000000000003'),
  'approved', 'the approved purchase kept its status');

-- A rejection without a payment id keeps whatever id the row already had.
UPDATE public.credit_purchases SET payment_id = 'mp-keep'
 WHERE id = 'c0000000-0000-0000-0000-000000000002';
UPDATE public.credit_purchases SET status = 'pending'
 WHERE id = 'c0000000-0000-0000-0000-000000000002';
SELECT lives_ok(
  $$ SELECT public.reject_pending_purchase('c0000000-0000-0000-0000-000000000002', NULL, NULL) $$,
  'reject accepts a null payment id and detail');
SELECT is(
  (SELECT payment_id FROM public.credit_purchases WHERE id = 'c0000000-0000-0000-0000-000000000002'),
  'mp-keep', 'a null payment id does not erase the stored one');

-- ── ACL: money RPCs are service_role only ───────────────────────────────────
SELECT ok(
  NOT has_function_privilege('authenticated',
    'public.approve_purchase_and_grant(uuid, text)', 'EXECUTE'),
  'authenticated cannot EXECUTE approve_purchase_and_grant');
SELECT ok(
  NOT has_function_privilege('anon',
    'public.reject_pending_purchase(uuid, text, text)', 'EXECUTE'),
  'anon cannot EXECUTE reject_pending_purchase');

SELECT * FROM finish();
ROLLBACK;
