import { useMemo } from "react";
import { useAuth } from "@/hooks/useAuth";
import { computeAccess, type Access } from "@/lib/domain/access";

/**
 * The current user's access state (both credit buckets, trial clock, paywall).
 * Null while the profile is loading. Recomputed when the profile changes; the
 * clock is read at render time, which is enough for banners and gates.
 */
export function useAccess(): Access | null {
  const { profile } = useAuth();
  return useMemo(() => computeAccess(profile, new Date()), [profile]);
}
