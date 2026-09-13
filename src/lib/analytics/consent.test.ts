import { describe, it, expect } from "vitest";
import { browserStorage, CONSENT_STORAGE_KEY, CONSENT_VERSION, DENIED_ALL, GRANTED_ALL, readStoredConsent, storeConsent } from "./consent";

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
