import { beforeEach, describe, it, expect, vi } from "vitest";
import {
  browserStorage,
  CONSENT_STORAGE_KEY,
  CONSENT_VERSION,
  DENIED_ALL,
  GRANTED_ALL,
  consentReopenInvoker,
  hasDecidedConsent,
  readStoredConsent,
  requestConsentReopen,
  resetConsentSession,
  storeConsent,
  subscribeConsent,
  subscribeConsentReopen,
} from "./consent";

function memoryStorage(initial: Record<string, string> = {}) {
  const map = new Map(Object.entries(initial));
  return {
    getItem: (k: string) => map.get(k) ?? null,
    setItem: (k: string, v: string) => { map.set(k, v); },
    map,
  };
}

describe("consent storage", () => {
  it("round-trips a decision for the current notice version", () => {
    const storage = memoryStorage();
    storeConsent(storage, GRANTED_ALL, new Date("2026-09-14T10:00:00Z"));
    expect(JSON.parse(storage.map.get(CONSENT_STORAGE_KEY)!)).toEqual({ version: CONSENT_VERSION, consent: GRANTED_ALL, decidedAt: "2026-09-14T10:00:00.000Z" });
    expect(readStoredConsent(storage)).toEqual(GRANTED_ALL);
  });

  it("asks again when the version changed or the value is malformed", () => {
    expect(readStoredConsent(memoryStorage({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: "old", consent: DENIED_ALL }) }))).toBeNull();
    expect(readStoredConsent(memoryStorage({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, consent: { analytics_storage: "maybe" } }) }))).toBeNull();
    expect(readStoredConsent(memoryStorage({ [CONSENT_STORAGE_KEY]: JSON.stringify({ version: CONSENT_VERSION, consent: null }) }))).toBeNull();
    expect(readStoredConsent(memoryStorage({ [CONSENT_STORAGE_KEY]: "not json" }))).toBeNull();
    expect(readStoredConsent(memoryStorage())).toBeNull();
    expect(readStoredConsent(null)).toBeNull();
  });

  it("tolerates a storage that throws on write, and no storage at all", () => {
    expect(() => storeConsent({ setItem: () => { throw new Error("quota"); } }, DENIED_ALL)).not.toThrow();
    expect(() => storeConsent(null, DENIED_ALL)).not.toThrow();
  });

  it("uses the default clock when none is given", () => {
    const storage = memoryStorage();
    storeConsent(storage, DENIED_ALL);
    expect(JSON.parse(storage.map.get(CONSENT_STORAGE_KEY)!).decidedAt).toMatch(/^\d{4}-/);
  });

  it("exposes localStorage in the browser and null when it throws", () => {
    expect(browserStorage()).toBe(window.localStorage);
    const original = Object.getOwnPropertyDescriptor(window, "localStorage");
    Object.defineProperty(window, "localStorage", { get() { throw new Error("blocked"); }, configurable: true });
    expect(browserStorage()).toBeNull();
    Object.defineProperty(window, "localStorage", original!);
  });
});

describe("consent decision in this page session", () => {
  beforeEach(() => resetConsentSession());

  it("is undecided until a decision is stored, then decided", () => {
    const storage = memoryStorage();
    expect(hasDecidedConsent(storage)).toBe(false);
    storeConsent(storage, DENIED_ALL);
    expect(hasDecidedConsent(storage)).toBe(true);
  });

  it("counts a stored decision from an earlier visit", () => {
    const storage = memoryStorage();
    storeConsent(storage, GRANTED_ALL);
    resetConsentSession();
    expect(hasDecidedConsent(storage)).toBe(true);
  });

  it("counts a decision made while storage is unavailable (the banner is gone for this session)", () => {
    storeConsent(null, GRANTED_ALL);
    expect(hasDecidedConsent(null)).toBe(true);
    resetConsentSession();
    expect(hasDecidedConsent(null)).toBe(false);
  });

  it("notifies subscribers on every decision until they unsubscribe", () => {
    const listener = vi.fn();
    const unsubscribe = subscribeConsent(listener);
    storeConsent(memoryStorage(), GRANTED_ALL);
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    storeConsent(memoryStorage(), DENIED_ALL);
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("still notifies when the write throws (private mode)", () => {
    const listener = vi.fn();
    subscribeConsent(listener);
    storeConsent({ setItem: () => { throw new Error("quota"); } }, GRANTED_ALL);
    expect(listener).toHaveBeenCalledTimes(1);
    expect(hasDecidedConsent(null)).toBe(true);
  });
});

describe("reopening the consent banner (Preferências de cookies)", () => {
  beforeEach(() => resetConsentSession());

  it("remembers who asked for the reopen (to hand the focus back) until the next decision", () => {
    expect(consentReopenInvoker()).toBeNull();
    const invoker = document.createElement("button");
    requestConsentReopen(invoker);
    expect(consentReopenInvoker()).toBe(invoker);
    storeConsent(memoryStorage(), DENIED_ALL);
    expect(consentReopenInvoker()).toBeNull();
  });

  it("accepts a reopen with nobody to return the focus to", () => {
    const storage = memoryStorage();
    storeConsent(storage, GRANTED_ALL);
    requestConsentReopen();
    expect(consentReopenInvoker()).toBeNull();
    expect(hasDecidedConsent(storage)).toBe(false);
    requestConsentReopen(null);
    expect(consentReopenInvoker()).toBeNull();
  });

  it("counts as undecided while reopened, even over a stored decision, until the visitor decides again", () => {
    const storage = memoryStorage();
    storeConsent(storage, GRANTED_ALL);
    expect(hasDecidedConsent(storage)).toBe(true);
    requestConsentReopen();
    expect(hasDecidedConsent(storage)).toBe(false);
    expect(readStoredConsent(storage)).toEqual(GRANTED_ALL);
    storeConsent(storage, DENIED_ALL);
    expect(hasDecidedConsent(storage)).toBe(true);
    expect(readStoredConsent(storage)).toEqual(DENIED_ALL);
  });

  it("notifies reopen subscribers on every request until they unsubscribe, without waking decision subscribers", () => {
    const onReopen = vi.fn();
    const onDecision = vi.fn();
    const unsubscribe = subscribeConsentReopen(onReopen);
    subscribeConsent(onDecision);
    requestConsentReopen();
    requestConsentReopen();
    expect(onReopen).toHaveBeenCalledTimes(2);
    expect(onDecision).not.toHaveBeenCalled();
    unsubscribe();
    requestConsentReopen();
    expect(onReopen).toHaveBeenCalledTimes(2);
  });

  it("is forgotten by the test reset helper, invoker included", () => {
    const storage = memoryStorage();
    storeConsent(storage, GRANTED_ALL);
    requestConsentReopen(document.createElement("button"));
    resetConsentSession();
    expect(hasDecidedConsent(storage)).toBe(true);
    expect(consentReopenInvoker()).toBeNull();
  });
});
