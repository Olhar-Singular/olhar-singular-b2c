-- =============================================================================
-- M6 — Persistence: adaptations canonical single-version shape
--
-- Reshapes public.adaptations to store the canonical AdaptationResult flow:
--   - original_activity  : the raw activity text the user pasted (NOT NULL ''
--                          closes the historic empty-activity bug)
--   - activity_type      : the selected activity type (nullable; UI-driven)
--   - barriers_used      : the barriers snapshot used for this adaptation
--   - observation_notes  : free-text notes the user typed in the wizard
--                          (nullable; persisted so they survive a reopen)
--   - adaptation_result  : the full canonical AdaptationResult jsonb
--                          ({ schemaVersion, document, strategies_applied,
--                             pedagogical_justification, implementation_tips })
--   - status             : 'draft' (autosaved) | 'ready' (user clicked Salvar)
--
-- The old `content jsonb` column (the broken single-blob design that lost the
-- original activity + metadata) is DROPPED — keeping it would invite writes to
-- two competing shapes. There is no production data to preserve in B2C yet.
--
-- Owner RLS (4 policies), the handle_updated_at trigger, and existing indexes
-- are preserved from the initial schema. A composite index on
-- (user_id, updated_at desc) backs the "Minhas Adaptações" history list.
--
-- NOTE: requires a migration-reviewer sign-off before any push. After running,
-- regenerate src/integrations/supabase/types.ts via `make gen-types`.
-- =============================================================================

ALTER TABLE public.adaptations
  ADD COLUMN IF NOT EXISTS original_activity text NOT NULL DEFAULT '',
  ADD COLUMN IF NOT EXISTS activity_type     text,
  ADD COLUMN IF NOT EXISTS barriers_used     jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS observation_notes text,
  ADD COLUMN IF NOT EXISTS adaptation_result jsonb NOT NULL DEFAULT '{}',
  ADD COLUMN IF NOT EXISTS status            text  NOT NULL DEFAULT 'draft';

-- Status domain: draft (autosaved) or ready (explicitly saved by the user).
ALTER TABLE public.adaptations
  DROP CONSTRAINT IF EXISTS adaptations_status_check;
ALTER TABLE public.adaptations
  ADD CONSTRAINT adaptations_status_check CHECK (status IN ('draft', 'ready'));

-- Drop the obsolete single-blob column (replaced by adaptation_result).
ALTER TABLE public.adaptations
  DROP COLUMN IF EXISTS content;

-- History list ordering: most-recently-updated first, scoped to the owner.
CREATE INDEX IF NOT EXISTS idx_adaptations_user_updated
  ON public.adaptations (user_id, updated_at DESC);

-- RLS policies, the handle_updated_at trigger, and the user_id /
-- barrier_profile_id indexes are unchanged from 20260420000000_initial_schema.
