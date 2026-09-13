// What runs on every navigation: consent defaults (once), the GTM container
// on the routes where it is allowed, and attribution capture. Pure function
// over injected browser pieces so the sequence is unit-tested; the React hook
// in AnalyticsBoot only feeds it the current location.

import { browserStorage, DENIED_ALL, readStoredConsent, type Consent } from "@/lib/analytics/consent";
import { gtagConsentDefault, gtagConsentUpdate } from "@/lib/analytics/dataLayer";
import { loadGtm, readGtmId } from "@/lib/analytics/gtm";
import { captureAttribution, mergeAttribution, readAttribution, sessionStore, storeAttribution } from "@/lib/analytics/attribution";

let defaultsApplied = false;

export interface BootInput {
  pathname: string;
  search: string;
  referrer: string;
  cookie: string;
  gtmId?: string;
  now?: Date;
}

export interface BootResult {
  consent: Consent | null;
  gtmLoaded: boolean;
}

export function bootAnalytics(input: BootInput): BootResult {
  const consent = readStoredConsent(browserStorage());

  if (!defaultsApplied) {
    gtagConsentDefault(DENIED_ALL);
    if (consent) gtagConsentUpdate(consent);
    defaultsApplied = true;
  }

  const gtmLoaded = loadGtm(input.gtmId ?? readGtmId(), input.pathname);

  const session = sessionStore();
  const captured = captureAttribution({
    search: input.search,
    pathname: input.pathname,
    referrer: input.referrer,
    cookie: input.cookie,
    consent: consent ?? DENIED_ALL,
    now: input.now,
  });
  storeAttribution(session, mergeAttribution(readAttribution(session), captured));

  return { consent, gtmLoaded };
}

/** Exposed for tests. */
export function resetAnalyticsBoot(): void {
  defaultsApplied = false;
}
