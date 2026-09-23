// Marketing attribution captured on the landing page and sent with the
// checkout, so a purchase can be matched to the campaign that brought it.
// Campaign parameters and the referrer are always kept (no cookie involved);
// the GA and Meta cookies are read only after the matching consent.

import type { Consent } from "@/lib/analytics/consent";

export const ATTRIBUTION_STORAGE_KEY = "olhar:attribution";

export interface Attribution {
  utm_source?: string;
  utm_medium?: string;
  utm_campaign?: string;
  utm_term?: string;
  utm_content?: string;
  gclid?: string;
  fbclid?: string;
  referrer?: string;
  landing_path?: string;
  /** GA client id (from the _ga cookie), only with analytics_storage granted. */
  ga_client_id?: string;
  /** Meta browser id / click id, only with ad_storage granted. */
  fbp?: string;
  fbc?: string;
  captured_at?: string;
  consent?: Consent;
}

const CAMPAIGN_KEYS = ["utm_source", "utm_medium", "utm_campaign", "utm_term", "utm_content", "gclid", "fbclid"] as const;
const MAX_LEN = 200;

function clean(value: string | null): string | undefined {
  if (!value) return undefined;
  const trimmed = value.trim().slice(0, MAX_LEN);
  return trimmed ? trimmed : undefined;
}

export function readCookie(cookieHeader: string, name: string): string | undefined {
  for (const part of cookieHeader.split(";")) {
    const [k, ...rest] = part.trim().split("=");
    if (k === name) return rest.join("=") || undefined;
  }
  return undefined;
}

// The _ga cookie is "GA1.1.<client_id>": the client id is the last two parts.
export function gaClientIdFromCookie(cookieHeader: string): string | undefined {
  const raw = readCookie(cookieHeader, "_ga");
  if (!raw) return undefined;
  const parts = raw.split(".");
  return parts.length >= 4 ? `${parts[2]}.${parts[3]}` : undefined;
}

export function captureAttribution(input: {
  search: string;
  pathname: string;
  referrer: string;
  cookie: string;
  consent: Consent;
  now?: Date;
}): Attribution {
  const params = new URLSearchParams(input.search);
  const out: Attribution = {};
  for (const key of CAMPAIGN_KEYS) {
    const value = clean(params.get(key));
    if (value) out[key] = value;
  }
  const referrer = clean(input.referrer);
  if (referrer) out.referrer = referrer;
  out.landing_path = input.pathname;
  if (input.consent.analytics_storage === "granted") {
    const gaId = gaClientIdFromCookie(input.cookie);
    if (gaId) out.ga_client_id = gaId;
  }
  if (input.consent.ad_storage === "granted") {
    const fbp = readCookie(input.cookie, "_fbp");
    const fbc = readCookie(input.cookie, "_fbc");
    if (fbp) out.fbp = fbp;
    if (fbc) out.fbc = fbc;
  }
  out.captured_at = (input.now ?? new Date()).toISOString();
  out.consent = input.consent;
  return out;
}

// The first touch of the session wins for campaign data; consent and cookies
// are refreshed on every capture so a later "accept" completes the record.
export function mergeAttribution(previous: Attribution | null, next: Attribution): Attribution {
  if (!previous) return next;
  const merged: Attribution = { ...next, ...previous };
  merged.consent = next.consent;
  if (next.ga_client_id) merged.ga_client_id = next.ga_client_id;
  if (next.fbp) merged.fbp = next.fbp;
  if (next.fbc) merged.fbc = next.fbc;
  return merged;
}

export function readAttribution(storage: Pick<Storage, "getItem"> | null): Attribution | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(ATTRIBUTION_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? (parsed as Attribution) : null;
  } catch {
    return null;
  }
}

export function storeAttribution(storage: Pick<Storage, "setItem"> | null, attribution: Attribution): void {
  if (!storage) return;
  try {
    storage.setItem(ATTRIBUTION_STORAGE_KEY, JSON.stringify(attribution));
  } catch {
    // Storage unavailable: the checkout simply goes without attribution.
  }
}

export function sessionStore(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}
