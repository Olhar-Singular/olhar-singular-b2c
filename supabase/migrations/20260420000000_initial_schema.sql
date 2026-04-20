-- =============================================================================
-- Initial schema for Olhar Singular B2C
-- Owner-based RLS throughout — no schools, no shared tenants
-- =============================================================================

-- ---------------------------------------------------------------------------
-- updated_at helper (created here; do NOT recreate in subsequent migrations)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_updated_at()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;


-- =============================================================================
-- 1. profiles
-- PK = auth.users(id), so condition uses "id" instead of "user_id"
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.profiles (
  id                     uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name              text,
  credit_balance         integer NOT NULL DEFAULT 10,
  free_adaptation_used   boolean NOT NULL DEFAULT false,
  created_at             timestamptz NOT NULL DEFAULT now(),
  updated_at             timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own profile"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = id);

CREATE POLICY "Users can insert their own profile"
  ON public.profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can update their own profile"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = id)
  WITH CHECK (auth.uid() = id);

CREATE POLICY "Users can delete their own profile"
  ON public.profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = id);

CREATE TRIGGER update_profiles_updated_at
  BEFORE UPDATE ON public.profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();


-- =============================================================================
-- 2. barrier_profiles
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.barrier_profiles (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  barriers    text[] NOT NULL DEFAULT '{}',
  observation text,
  created_at  timestamptz NOT NULL DEFAULT now(),
  updated_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.barrier_profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own barrier_profiles"
  ON public.barrier_profiles FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own barrier_profiles"
  ON public.barrier_profiles FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own barrier_profiles"
  ON public.barrier_profiles FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own barrier_profiles"
  ON public.barrier_profiles FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_barrier_profiles_updated_at
  BEFORE UPDATE ON public.barrier_profiles
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_barrier_profiles_user_id ON public.barrier_profiles(user_id);


-- =============================================================================
-- 3. adaptations
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.adaptations (
  id                  uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id             uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  -- SET NULL so deleting a barrier_profile does not cascade-delete adaptations
  barrier_profile_id  uuid REFERENCES public.barrier_profiles(id) ON DELETE SET NULL,
  title               text NOT NULL DEFAULT '',
  content             jsonb NOT NULL DEFAULT '{}',
  credits_spent       integer NOT NULL DEFAULT 0,
  created_at          timestamptz NOT NULL DEFAULT now(),
  updated_at          timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.adaptations ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own adaptations"
  ON public.adaptations FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own adaptations"
  ON public.adaptations FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own adaptations"
  ON public.adaptations FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can delete their own adaptations"
  ON public.adaptations FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

CREATE TRIGGER update_adaptations_updated_at
  BEFORE UPDATE ON public.adaptations
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_adaptations_user_id            ON public.adaptations(user_id);
CREATE INDEX IF NOT EXISTS idx_adaptations_barrier_profile_id ON public.adaptations(barrier_profile_id);


-- =============================================================================
-- 4. credit_transactions
-- Financial ledger — immutable by design: no UPDATE, no DELETE via RLS
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.credit_transactions (
  id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  -- positive = credit granted, negative = credit consumed
  delta       integer NOT NULL,
  type        text NOT NULL CHECK (type IN ('signup_bonus','purchase','adapt','regenerate','chat','refund')),
  ref_id      uuid,    -- optional: adaptation_id, purchase_id, etc.
  payment_id  text,    -- external ID (Mercado Pago)
  created_at  timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_transactions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit_transactions"
  ON public.credit_transactions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT is allowed for authenticated users (edge functions run as the user
-- or via service_role; service_role bypasses RLS automatically)
CREATE POLICY "Users can insert their own credit_transactions"
  ON public.credit_transactions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

-- No UPDATE policy — ledger rows are immutable
-- No DELETE policy — ledger rows are immutable

CREATE INDEX IF NOT EXISTS idx_credit_transactions_user_id    ON public.credit_transactions(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_transactions_created_at ON public.credit_transactions(created_at DESC);


-- =============================================================================
-- 5. credit_purchases
-- Created exclusively by the Mercado Pago webhook (service_role).
-- Owners may SELECT and UPDATE (e.g. local optimistic status reads).
-- INSERT is blocked via RLS — only service_role key bypasses RLS.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.credit_purchases (
  id               uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  payment_id       text UNIQUE,   -- external Mercado Pago ID
  amount_brl       numeric(10,2) NOT NULL,
  credits_granted  integer NOT NULL,
  status           text NOT NULL DEFAULT 'pending'
                     CHECK (status IN ('pending','approved','rejected','cancelled')),
  created_at       timestamptz NOT NULL DEFAULT now(),
  updated_at       timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.credit_purchases ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own credit_purchases"
  ON public.credit_purchases FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT intentionally omitted — only service_role (webhook) inserts purchases
-- UPDATE intentionally omitted — only service_role (webhook) updates status/credits
-- DELETE intentionally omitted — purchase records must be kept for auditing

CREATE TRIGGER update_credit_purchases_updated_at
  BEFORE UPDATE ON public.credit_purchases
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

CREATE INDEX IF NOT EXISTS idx_credit_purchases_user_id    ON public.credit_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_credit_purchases_payment_id ON public.credit_purchases(payment_id);


-- =============================================================================
-- 6. ai_usage_logs
-- Written by edge functions via service_role key (bypasses RLS).
-- Owners may SELECT their own rows.
-- school_id kept nullable for compatibility with the shared logAiUsage.ts helper.
-- ON DELETE SET NULL: deleting a user must not destroy audit history.
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ai_usage_logs (
  id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id              uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  school_id            uuid,   -- always NULL in B2C; kept for _shared/ compatibility
  action_type          text NOT NULL,
  model                text NOT NULL,
  endpoint             text,
  input_tokens         integer,
  output_tokens        integer,
  total_tokens         integer,
  cost_input           numeric(12,8),
  cost_output          numeric(12,8),
  cost_total           numeric(12,8),
  request_duration_ms  integer,
  status               text NOT NULL DEFAULT 'success',
  error_message        text,
  metadata             jsonb,
  tokens_source        text DEFAULT 'unknown',
  created_at           timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_usage_logs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own ai_usage_logs"
  ON public.ai_usage_logs FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

-- INSERT intentionally omitted — only edge functions via service_role insert logs
-- No UPDATE or DELETE — logs are append-only audit records

CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_user_id    ON public.ai_usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_ai_usage_logs_created_at ON public.ai_usage_logs(created_at DESC);


-- =============================================================================
-- 7. ai_model_pricing
-- Read-only for anon + authenticated. Mutations only via service_role / admin.
-- Column names match what logAiUsage.ts queries:
--   price_input_per_million, price_output_per_million, is_active
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.ai_model_pricing (
  id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  model                    text UNIQUE NOT NULL,
  price_input_per_million  numeric(12,8) NOT NULL DEFAULT 0,
  price_output_per_million numeric(12,8) NOT NULL DEFAULT 0,
  is_active                boolean NOT NULL DEFAULT true,
  created_at               timestamptz NOT NULL DEFAULT now(),
  updated_at               timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.ai_model_pricing ENABLE ROW LEVEL SECURITY;

-- Public read: pricing data is not sensitive
CREATE POLICY "Public can view ai_model_pricing"
  ON public.ai_model_pricing FOR SELECT
  TO anon, authenticated
  USING (true);

-- No INSERT / UPDATE / DELETE policies — only service_role may mutate

CREATE TRIGGER update_ai_model_pricing_updated_at
  BEFORE UPDATE ON public.ai_model_pricing
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_updated_at();

-- Seed: prices are in USD per million tokens (values from logAiUsage.ts fallback)
INSERT INTO public.ai_model_pricing (model, price_input_per_million, price_output_per_million)
VALUES
  ('google/gemini-2.5-pro',                     1.25,  5.00),
  ('google/gemini-2.5-flash',                   0.075, 0.30),
  ('google/gemini-3-flash-preview',             0.10,  0.40),
  ('google/gemini-3.1-flash-image-preview',     0.10,  0.40)
ON CONFLICT (model) DO UPDATE
  SET price_input_per_million  = EXCLUDED.price_input_per_million,
      price_output_per_million = EXCLUDED.price_output_per_million,
      updated_at               = now();


-- =============================================================================
-- B2C stub: logAiUsage.ts (_shared) calls this RPC expecting a school_id.
-- B2C has no schools — always returns NULL to silence production warnings.
-- =============================================================================
CREATE OR REPLACE FUNCTION public.get_user_school_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
AS $$
  SELECT NULL::uuid;
$$;


-- =============================================================================
-- Auto-create profile on sign-up
-- =============================================================================
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (
    NEW.id,
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      split_part(NEW.email, '@', 1)
    )
  )
  ON CONFLICT (id) DO NOTHING;
  RETURN NEW;
END;
$$;

CREATE OR REPLACE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
