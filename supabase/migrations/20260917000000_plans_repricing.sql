-- =============================================================================
-- Plans repricing (2026-09): 39,90/300 · 59,90/480 · 99,90/900
-- -----------------------------------------------------------------------------
-- Market check: the Brazilian anchor for a teacher's AI tool is "unlimited for
-- R$39,90/month" (Teachy, Skooly); the adaptation-specific players publish no
-- price. The entry plan moves to that anchor and every plan now carries a full
-- month of work: a typical barrier mix costs ~9.5 credits per adaptation, so
-- 300 ≈ 30 adaptations, 480 ≈ 50, 900 ≈ 90. The curve rises with the plan
-- (7.5 → 8 → 9 credits per real) so no plan is beaten by Básico + an extra
-- package (300 for R$59,90 = 5 credits per real).
--
-- UPDATE by slug instead of editing the 20260914 seed: that migration already
-- ran, and a changed seed never re-applies. Live subscriptions keep the amount
-- of their MP preapproval; the new quota applies at the next renewal, because
-- the renewal RPCs read plans.monthly_credits at grant time.
--
-- Covered by subscriptions_schema.test.sql.
-- =============================================================================

UPDATE public.plans SET price_brl = 39.90, monthly_credits = 300 WHERE slug = 'basico';
UPDATE public.plans SET price_brl = 59.90, monthly_credits = 480 WHERE slug = 'profissional';
UPDATE public.plans SET price_brl = 99.90, monthly_credits = 900 WHERE slug = 'avancado';
