-- Add name column to barrier_profiles for user-defined profile labels
ALTER TABLE public.barrier_profiles
  ADD COLUMN IF NOT EXISTS name TEXT;
