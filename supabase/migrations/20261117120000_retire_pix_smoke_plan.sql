-- =============================================================================
-- Retire the R$1 Pix smoke offer (pix-teste-admin)
-- -----------------------------------------------------------------------------
-- The production smoke passed on 17/11/2026 (payment approved, 1 credit in the
-- plan bucket). The row stays, inactive: its purchase still references it
-- (credit_purchases.prepaid_plan_id), and both catalogue policies filter on
-- `active`, so nobody, super-admins included, sees or buys it any more.
-- Re-enable with an UPDATE ... SET active = true for a future smoke.
-- =============================================================================
UPDATE public.prepaid_plans
   SET active = false
 WHERE slug = 'pix-teste-admin';
