-- =============================================================================
-- Increase signup bonus: every new user now starts with 50 free credits
-- (was 10). New users only — existing balances are untouched.
-- =============================================================================

ALTER TABLE public.profiles
  ALTER COLUMN credit_balance SET DEFAULT 50;
