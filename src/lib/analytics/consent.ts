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

// A decision made in this page session also counts when the storage refused the
// write: the banner is gone for the session, so whatever waited on it can go on.
let decidedThisSession = false;
const decisionListeners = new Set<() => void>();

// "Preferências de cookies" reopens the banner over a stored decision (LGPD
// art. 8 §5 / art. 18 IX). Until the visitor decides again, consent counts as
// undecided for whatever hides behind the banner, while the stored decision
// itself stays in force (nothing is revoked until they click).
let reopenRequested = false;
let reopenInvoker: HTMLElement | null = null;
const reopenListeners = new Set<() => void>();

export function storeConsent(storage: Pick<Storage, "setItem"> | null, consent: Consent, now: Date = new Date()): void {
  decidedThisSession = true;
  reopenRequested = false;
  reopenInvoker = null;
  try {
    if (storage) {
      const stored: StoredConsent = { version: CONSENT_VERSION, consent, decidedAt: now.toISOString() };
      storage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(stored));
    }
  } catch {
    // Private mode or full storage: the banner will simply ask again next time.
  }
  decisionListeners.forEach((listener) => listener());
}

/** True once the visitor decided, now or on an earlier visit, and the banner is not reopened (it is no longer up). */
export function hasDecidedConsent(storage: Pick<Storage, "getItem"> | null): boolean {
  return !reopenRequested && (decidedThisSession || readStoredConsent(storage) !== null);
}

export function subscribeConsent(listener: () => void): () => void {
  decisionListeners.add(listener);
  return () => {
    decisionListeners.delete(listener);
  };
}

/**
 * Asks the banner to show again, over any stored decision. Stays open until the
 * next storeConsent. `returnTo` is who asked (the link or the menu trigger): the
 * banner hands the focus back to it after the decision (WCAG 2.4.3).
 */
export function requestConsentReopen(returnTo: HTMLElement | null = null): void {
  reopenRequested = true;
  reopenInvoker = returnTo;
  reopenListeners.forEach((listener) => listener());
}

/** The element that asked for the current reopen, or null (no reopen, or nobody to return the focus to). */
export function consentReopenInvoker(): HTMLElement | null {
  return reopenInvoker;
}

export function subscribeConsentReopen(listener: () => void): () => void {
  reopenListeners.add(listener);
  return () => {
    reopenListeners.delete(listener);
  };
}

/** Test helper, like resetDataLayer: forgets the in-session decision and any pending reopen. */
export function resetConsentSession(): void {
  decidedThisSession = false;
  reopenRequested = false;
  reopenInvoker = null;
}

/** localStorage when the browser exposes it, else null (SSR, tests, lockdown). */
export function browserStorage(): Storage | null {
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}
