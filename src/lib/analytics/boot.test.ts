import { describe, it, expect, beforeEach } from "vitest";
import { bootAnalytics, resetAnalyticsBoot } from "./boot";
import { resetDataLayer } from "./dataLayer";
import { resetGtm } from "./gtm";
import { CONSENT_STORAGE_KEY, CONSENT_VERSION, DENIED_ALL, GRANTED_ALL } from "./consent";
import { ATTRIBUTION_STORAGE_KEY } from "./attribution";

describe("bootAnalytics", () => {
  beforeEach(() => {
    resetAnalyticsBoot();
    resetDataLayer();
    resetGtm();
    window.localStorage.clear();
    window.sessionStorage.clear();
    document.head.querySelectorAll("script[data-gtm]").forEach((s) => s.remove());
  });

  it("applies denied defaults once, loads GTM on allowed routes and captures attribution", () => {
    const first = bootAnalytics({ pathname: "/", search: "?utm_source=meta", referrer: "https://x.com/", cookie: "", gtmId: "GTM-1" });
    expect(first).toEqual({ consent: null, gtmLoaded: true });
    expect(window.dataLayer?.[0]).toEqual(["consent", "default", { ...DENIED_ALL, wait_for_update: 500 }]);
    expect(JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)!)).toMatchObject({ utm_source: "meta", landing_path: "/", consent: DENIED_ALL });

    const second = bootAnalytics({ pathname: "/assinar", search: "", referrer: "", cookie: "", gtmId: "GTM-1" });
    expect(second.gtmLoaded).toBe(true);
    expect(window.dataLayer?.filter((e) => Array.isArray(e) && e[1] === "default")).toHaveLength(1);
    expect(JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)!)).toMatchObject({ utm_source: "meta", landing_path: "/" });
  });

  it("replays a stored consent right after the default", () => {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify({ version: CONSENT_VERSION, consent: GRANTED_ALL, decidedAt: "x" }));
    const out = bootAnalytics({ pathname: "/assinar", search: "", referrer: "", cookie: "_ga=GA1.1.1.2", gtmId: "" });
    expect(out).toEqual({ consent: GRANTED_ALL, gtmLoaded: false });
    expect(window.dataLayer?.[1]).toEqual(["consent", "update", { ...GRANTED_ALL }]);
    expect(JSON.parse(window.sessionStorage.getItem(ATTRIBUTION_STORAGE_KEY)!)).toMatchObject({ ga_client_id: "1.2" });
  });

  it("falls back to the environment id and clock", () => {
    const out = bootAnalytics({ pathname: "/", search: "", referrer: "", cookie: "" });
    expect(out.gtmLoaded).toBe(false);
  });
});
