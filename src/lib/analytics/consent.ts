// Consent Mode v2 state. Everything is denied until the visitor decides on the
// banner; the decision is stored per browser with the version of the notice,
// so a reworded notice asks again.

export type ConsentState = "granted" | "denied";

export interface Consent {
  analytics_storage: ConsentState;
  ad_storage: ConsentState;
  ad_user_data: ConsentState;
  ad_personalization: ConsentState;
}

export const CONSENT_VERSION = "2026-09";
export const CONSENT_STORAGE_KEY = "olhar:consent";

export const DENIED_ALL: Consent = {
  analytics_storage: "denied",
  ad_storage: "denied",
  ad_user_data: "denied",
  ad_personalization: "denied",
};

export const GRANTED_ALL: Consent = {
  analytics_storage: "granted",
  ad_storage: "granted",
  ad_user_data: "granted",
  ad_personalization: "granted",
};

interface StoredConsent {
  version: string;
  consent: Consent;
  decidedAt: string;
}

const KEYS: (keyof Consent)[] = ["analytics_storage", "ad_storage", "ad_user_data", "ad_personalization"];

function isConsent(value: unknown): value is Consent {
  if (typeof value !== "object" || value === null) return false;
  return KEYS.every((k) => ["granted", "denied"].includes(String((value as Record<string, unknown>)[k])));
}

/** The stored decision for the current notice version, or null (not decided yet). */
export function readStoredConsent(storage: Pick<Storage, "getItem"> | null): Consent | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(CONSENT_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredConsent>;
    if (parsed.version !== CONSENT_VERSION || !isConsent(parsed.consent)) return null;
    return parsed.consent;
  } catch {
    return null;
  }
}

export function storeConsent(storage: Pick<Storage, "setItem"> | null, consent: Consent, now: Date = new Date()): void {
  if (!storage) return;
  try {
    const stored: StoredConsent = { version: CONSENT_VERSION, consent, decidedAt: now.toISOString() };
    storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
  } catch {
    // Private mode or full storage: the banner will simply ask again next time.
  }
}

/** localStorage when the browser exposes it, else null (SSR, tests, lockdown). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
