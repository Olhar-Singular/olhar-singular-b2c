import { describe, it, expect, beforeEach, vi } from "vitest";
import { GTM_BLOCKED_PATHS, isGtmAllowedOn, loadGtm, readGtmId, resetGtm } from "./gtm";

describe("gtm", () => {
  beforeEach(() => {
    resetGtm();
    document.head.querySelectorAll("script[data-gtm]").forEach((s) => s.remove());
    delete window.dataLayer;
  });

  it("never allows the checkout and the first-access password routes", () => {
    expect(GTM_BLOCKED_PATHS).toEqual(["/assinar", "/definir-senha"]);
    expect(isGtmAllowedOn("/")).toBe(true);
    expect(isGtmAllowedOn("/assinar")).toBe(false);
    expect(isGtmAllowedOn("/assinar/")).toBe(false);
    expect(isGtmAllowedOn("/assinaturas")).toBe(true);
    expect(isGtmAllowedOn("/definir-senha")).toBe(false);
  });

  it("injects the container script once, with the gtm.start marker", () => {
    expect(loadGtm("GTM-XYZ", "/")).toBe(true);
    expect(loadGtm("GTM-XYZ", "/dashboard")).toBe(true);
    const scripts = document.head.querySelectorAll("script[data-gtm]");
    expect(scripts).toHaveLength(1);
    expect((scripts[0] as HTMLScriptElement).src).toBe("https://www.googletagmanager.com/gtm.js?id=GTM-XYZ");
    expect(window.dataLayer?.[0]).toMatchObject({ event: "gtm.js" });
  });

  it("does nothing without an id, a document, or on a blocked route", () => {
    expect(loadGtm("", "/")).toBe(false);
    expect(loadGtm("GTM-XYZ", "/assinar")).toBe(false);
    expect(document.head.querySelectorAll("script[data-gtm]")).toHaveLength(0);
    // Already loaded elsewhere: the blocked route reports the truth without injecting again.
    loadGtm("GTM-XYZ", "/");
    expect(loadGtm("GTM-XYZ", "/assinar")).toBe(true);
    expect(document.head.querySelectorAll("script[data-gtm]")).toHaveLength(1);
  });

  it("reads the id from the environment", () => {
    vi.stubEnv("VITE_GTM_ID", " GTM-ENV ");
    expect(readGtmId()).toBe("GTM-ENV");
    vi.stubEnv("VITE_GTM_ID", "");
    expect(readGtmId()).toBe("");
    vi.unstubAllEnvs();
  });
});
