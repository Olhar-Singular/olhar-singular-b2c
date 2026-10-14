import { useSyncExternalStore } from "react";
import { browserStorage, hasDecidedConsent, subscribeConsent, subscribeConsentReopen } from "@/lib/analytics/consent";

// One stable subscribe for useSyncExternalStore: the banner comes back on a
// reopen request and goes away on a decision, so both must wake the hook.
function subscribeConsentVisibility(listener: () => void): () => void {
  const unsubscribeDecision = subscribeConsent(listener);
  const unsubscribeReopen = subscribeConsentReopen(listener);
  return () => {
    unsubscribeDecision();
    unsubscribeReopen();
  };
}

/** Whether the consent banner is out of the way (the visitor decided and did not reopen it). Client-only app: no server snapshot. */
export function useConsentDecided(): boolean {
  return useSyncExternalStore(subscribeConsentVisibility, () => hasDecidedConsent(browserStorage()));
}
