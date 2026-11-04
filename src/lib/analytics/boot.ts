// What runs on every navigation: consent defaults (once), the GTM container
// and the Meta Pixel on the routes where they are allowed, and attribution capture. Pure function
// over injected browser pieces so the sequence is unit-tested; the React hook
// in AnalyticsBoot only feeds it the current location.

import { browserStorage, DENIED_ALL, readStoredConsent, type Consent } from "@/lib/analytics/consent";
import { gtagConsentDefault, gtagConsentUpdate } from "@/lib/analytics/dataLayer";
import { loadGtm, readGtmId } from "@/lib/analytics/gtm";
import { bootMetaPixel, readMetaPixelId } from "@/lib/analytics/metaPixel";
import { captureAttribution, mergeAttribution, readAttribution, sessionStore, storeAttribution } from "@/lib/analytics/attribution";

let defaultsApplied = false;

export interface BootInput {
  pathname: string;
  search: string;
  referrer: string;
  cookie: string;
  gtmId?: string;
  metaPixelId?: string;
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
  bootMetaPixel(input.metaPixelId ?? readMetaPixelId(), input.pathname, consent);

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
