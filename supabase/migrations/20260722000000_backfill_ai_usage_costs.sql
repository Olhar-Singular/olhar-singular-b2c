-- =============================================================================
-- Backfill: repair ai_usage_logs rows logged with the *resolved* API model name.
--
-- Edge functions passed resolveModel() output (e.g. 'gemini-2.5-pro') to
-- logAiUsage, but ai_model_pricing is keyed by canonical ids
-- (e.g. 'google/gemini-2.5-pro'). The pricing lookup never matched, so every
-- row was written with cost_input/cost_output/cost_total = 0 — the Admin
-- "Gasto (IA)" column and platform cost metrics always showed $0.00.
--
-- logAiUsage now canonicalizes the model before pricing and inserting
-- (toCanonicalModel in _shared/aiConfig.ts). This migration fixes history:
--   1. renames the model to its canonical id;
--   2. recomputes costs from the stored token counts × current pricing,
--      only where cost_total is still 0/NULL (priced rows are preserved).
--
-- The alias list mirrors MODEL_MAP in supabase/functions/_shared/aiConfig.ts.
-- Idempotent: after the rename, l.model no longer matches any resolved alias.
-- =============================================================================

WITH alias(resolved, canonical) AS (
  VALUES
    ('gemini-2.5-pro',                            'google/gemini-2.5-pro'),
    ('gemini-2.5-flash',                          'google/gemini-2.5-flash'),
    ('gemini-2.0-flash',                          'google/gemini-3-flash-preview'),
    ('gemini-2.0-flash-preview-image-generation', 'google/gemini-3.1-flash-image-preview')
)
-- LEFT JOIN: the rename must happen even if the pricing row is missing or
-- inactive — only the cost recompute is gated on an active pricing match.
UPDATE public.ai_usage_logs l
SET
  model       = a.canonical,
  cost_input  = CASE WHEN COALESCE(l.cost_total, 0) = 0 AND p.model IS NOT NULL
                     THEN (COALESCE(l.input_tokens, 0)::numeric / 1000000)
                          * p.price_input_per_million
                     ELSE l.cost_input END,
  cost_output = CASE WHEN COALESCE(l.cost_total, 0) = 0 AND p.model IS NOT NULL
                     THEN (COALESCE(l.output_tokens, 0)::numeric / 1000000)
                          * p.price_output_per_million
                     ELSE l.cost_output END,
  cost_total  = CASE WHEN COALESCE(l.cost_total, 0) = 0 AND p.model IS NOT NULL
                     THEN (COALESCE(l.input_tokens, 0)::numeric / 1000000)
                          * p.price_input_per_million
                        + (COALESCE(l.output_tokens, 0)::numeric / 1000000)
                          * p.price_output_per_million
                     ELSE l.cost_total END
FROM alias a
LEFT JOIN public.ai_model_pricing p
  ON p.model = a.canonical
 AND p.is_active
WHERE l.model = a.resolved;
