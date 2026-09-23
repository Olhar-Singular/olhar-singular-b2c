import { useEffect, useMemo, useState } from "react";
import { useAuth } from "@/hooks/useAuth";
import { computeAccess, type Access } from "@/lib/domain/access";

/** How often the clock behind the access state is re-read. */
export const ACCESS_CLOCK_MS = 60 * 1000;

/**
 * The current user's access state (both credit buckets, trial clock, paywall).
 * Null while the profile is loading. Recomputed when the profile changes and
 * once a minute, so a trial or plan period that ends while the tab is open is
 * reflected without a reload (the server is the real gate either way).
 */
export function useAccess(): Access | null {
  const { profile } = useAuth();
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNow(Date.now()), ACCESS_CLOCK_MS);
    return () => clearInterval(id);
  }, []);

  return useMemo(() => computeAccess(profile, new Date(now)), [profile, now]);
}
