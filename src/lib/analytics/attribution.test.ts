import { describe, it, expect } from "vitest";
import {
  ATTRIBUTION_STORAGE_KEY,
  captureAttribution,
  gaClientIdFromCookie,
  mergeAttribution,
  readAttribution,
  readCookie,
  sessionStore,
  storeAttribution,
} from "./attribution";
import { DENIED_ALL, GRANTED_ALL } from "./consent";

const NOW = new Date("2026-09-14T10:00:00Z");
const COOKIE = "_ga=GA1.1.123456.789012; _fbp=fb.1.1700000000.999; _fbc=fb.1.1700000000.AbC; other=x";

describe("cookies", () => {
  it("reads a cookie by name and extracts the GA client id", () => {
    expect(readCookie(COOKIE, "_fbp")).toBe("fb.1.1700000000.999");
    expect(readCookie(COOKIE, "missing")).toBeUndefined();
    expect(readCookie("empty=", "empty")).toBeUndefined();
    expect(gaClientIdFromCookie(COOKIE)).toBe("123456.789012");
    expect(gaClientIdFromCookie("_ga=GA1.1")).toBeUndefined();
    expect(gaClientIdFromCookie("")).toBeUndefined();
  });
});

describe("captureAttribution", () => {
  it("keeps campaign params and referrer always, cookies only with consent", () => {
    const denied = captureAttribution({
      search: "?utm_source=meta&utm_campaign=set&gclid=g1&fbclid=f1&ignored=x&utm_medium=%20%20",
      pathname: "/",
      referrer: "https://facebook.com/",
      cookie: COOKIE,
      consent: DENIED_ALL,
      now: NOW,
    });
    expect(denied).toEqual({
      utm_source: "meta", utm_campaign: "set", gclid: "g1", fbclid: "f1",
      referrer: "https://facebook.com/", landing_path: "/", captured_at: NOW.toISOString(), consent: DENIED_ALL,
    });

    const granted = captureAttribution({ search: "", pathname: "/assinar", referrer: "", cookie: COOKIE, consent: GRANTED_ALL, now: NOW });
    expect(granted).toMatchObject({ ga_client_id: "123456.789012", fbp: "fb.1.1700000000.999", fbc: "fb.1.1700000000.AbC", landing_path: "/assinar" });
    expect(granted.referrer).toBeUndefined();
  });

  it("truncates absurdly long values and stamps the current time by default", () => {
    const out = captureAttribution({ search: `?utm_term=${"x".repeat(500)}`, pathname: "/", referrer: "", cookie: "", consent: GRANTED_ALL });
    expect(out.utm_term).toHaveLength(200);
    expect(out.captured_at).toMatch(/^\d{4}-/);
    expect(out.ga_client_id).toBeUndefined();
  });
});

describe("mergeAttribution", () => {
  it("keeps the first touch for campaign data and refreshes consent and cookies", () => {
    const first = captureAttribution({ search: "?utm_source=google", pathname: "/", referrer: "", cookie: "", consent: DENIED_ALL, now: NOW });
    const later = captureAttribution({ search: "?utm_source=direct", pathname: "/assinar", referrer: "", cookie: COOKIE, consent: GRANTED_ALL, now: NOW });
    const merged = mergeAttribution(first, later);
    expect(merged.utm_source).toBe("google");
    expect(merged.landing_path).toBe("/");
    expect(merged.consent).toEqual(GRANTED_ALL);
    expect(merged.ga_client_id).toBe("123456.789012");
    expect(merged.fbp).toBeDefined();
    expect(merged.fbc).toBeDefined();
    expect(mergeAttribution(null, later)).toBe(later);
    const stillDenied = mergeAttribution(first, captureAttribution({ search: "", pathname: "/x", referrer: "", cookie: COOKIE, consent: DENIED_ALL, now: NOW }));
    expect(stillDenied.ga_client_id).toBeUndefined();
  });
});

describe("attribution storage", () => {
  function memoryStorage(initial: Record<string, string> = {}) {
    const map = new Map(Object.entries(initial));
    return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => { map.set(k, v); }, map };
  }

  it("round-trips and tolerates junk", () => {
    const storage = memoryStorage();
    storeAttribution(storage, { utm_source: "meta" });
    expect(readAttribution(storage)).toEqual({ utm_source: "meta" });
    expect(readAttribution(memoryStorage({ [ATTRIBUTION_STORAGE_KEY]: "junk" }))).toBeNull();
    expect(readAttribution(memoryStorage({ [ATTRIBUTION_STORAGE_KEY]: "null" }))).toBeNull();
    expect(readAttribution(memoryStorage())).toBeNull();
    expect(readAttribution(null)).toBeNull();
    expect(() => storeAttribution({ setItem: () => { throw new Error("quota"); } }, {})).not.toThrow();
    expect(() => storeAttribution(null, {})).not.toThrow();
  });

  it("exposes sessionStorage in the browser and null when it throws", () => {
    expect(sessionStore()).toBe(window.sessionStorage);
    const original = Object.getOwnPropertyDescriptor(window, "sessionStorage");
    Object.defineProperty(window, "sessionStorage", { get() { throw new Error("blocked"); }, configurable: true });
    expect(sessionStore()).toBeNull();
    Object.defineProperty(window, "sessionStorage", original!);
  });
});
