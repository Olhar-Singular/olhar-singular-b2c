import { describe, it, expect, beforeEach, vi } from "vitest";
import { bootMetaPixel, readMetaPixelId, resetMetaPixel, trackMetaInitiateCheckout, trackMetaViewContent } from "./metaPixel";
import { DENIED_ALL, GRANTED_ALL } from "./consent";

const calls = () => (window.fbq?.queue ?? []).map((entry) => [...entry]);

describe("metaPixel", () => {
  beforeEach(() => {
    resetMetaPixel();
    document.head.querySelectorAll("script[data-meta-pixel]").forEach((s) => s.remove());
    delete window.fbq;
    delete window._fbq;
    vi.unstubAllEnvs();
  });

  it("reads the id from the environment", () => {
    expect(readMetaPixelId()).toBe("");
    vi.stubEnv("VITE_META_PIXEL_ID", " 123 ");
    expect(readMetaPixelId()).toBe("123");
  });

  it("does nothing without an id or on the checkout and password routes", () => {
    expect(bootMetaPixel("", "/", null)).toBe(false);
    expect(bootMetaPixel("123", "/assinar", null)).toBe(false);
    expect(bootMetaPixel("123", "/definir-senha", null)).toBe(false);
    expect(window.fbq).toBeUndefined();
    expect(document.head.querySelectorAll("script[data-meta-pixel]")).toHaveLength(0);
  });

  it("loads fbevents.js once, holds events until the visitor decides, then PageView", () => {
    expect(bootMetaPixel("123", "/", null)).toBe(true);
    const scripts = document.head.querySelectorAll<HTMLScriptElement>("script[data-meta-pixel]");
    expect(scripts).toHaveLength(1);
    expect(scripts[0].src).toBe("https://connect.facebook.net/en_US/fbevents.js");
    expect(scripts[0].async).toBe(true);
    expect(calls()).toEqual([["consent", "revoke"], ["init", "123"], ["track", "PageView"]]);
    expect(window._fbq).toBe(window.fbq);
  });

  it("grants when ad_storage is granted and revokes again only when it changes", () => {
    bootMetaPixel("123", "/", null);
    bootMetaPixel("123", "/", GRANTED_ALL);
    bootMetaPixel("123", "/", GRANTED_ALL);
    bootMetaPixel("123", "/", DENIED_ALL);
    expect(calls().filter((c) => c[0] === "consent")).toEqual([["consent", "revoke"], ["consent", "grant"], ["consent", "revoke"]]);
    resetMetaPixel();
    delete window.fbq;
    bootMetaPixel("123", "/", GRANTED_ALL);
    bootMetaPixel("123", "/", DENIED_ALL);
    expect(calls().filter((c) => c[0] === "consent")).toEqual([["consent", "revoke"]]);
  });

  it("starts straight on init, with no revoke or grant queued, when the stored decision already allows ads", () => {
    bootMetaPixel("123", "/", GRANTED_ALL);
    expect(calls()).toEqual([["init", "123"], ["track", "PageView"]]);
  });

  it("fires one PageView per path, not per search change or consent update", () => {
    bootMetaPixel("123", "/", null);
    bootMetaPixel("123", "/", GRANTED_ALL);
    bootMetaPixel("123", "/entrar", GRANTED_ALL);
    expect(calls().filter((c) => c[1] === "PageView")).toHaveLength(2);
  });

  it("keeps a loaded pixel quiet on a blocked route", () => {
    bootMetaPixel("123", "/", null);
    expect(bootMetaPixel("123", "/assinar", null)).toBe(false);
    expect(calls().filter((c) => c[1] === "PageView")).toHaveLength(1);
    expect(document.head.querySelectorAll("script[data-meta-pixel]")).toHaveLength(1);
  });

  it("calls the real implementation once fbevents.js has taken over the stub", () => {
    bootMetaPixel("123", "/", null);
    const callMethod = vi.fn();
    window.fbq!.callMethod = callMethod;
    bootMetaPixel("123", "/entrar", GRANTED_ALL);
    expect(callMethod).toHaveBeenCalledWith("consent", "grant");
    expect(callMethod).toHaveBeenCalledWith("track", "PageView");
  });

  it("reuses an fbq that already exists", () => {
    const existing = Object.assign(vi.fn(), { queue: [] as unknown[][], push: vi.fn(), loaded: true, version: "2.0" });
    window.fbq = existing as unknown as typeof window.fbq;
    bootMetaPixel("123", "/", null);
    expect(window.fbq).toBe(existing);
  });

  it("sends InitiateCheckout with the CTA origin only while the pixel is loaded", () => {
    trackMetaInitiateCheckout("hero");
    expect(window.fbq).toBeUndefined();
    bootMetaPixel("123", "/", null);
    trackMetaInitiateCheckout("hero");
    expect(calls().at(-1)).toEqual(["track", "InitiateCheckout", { origem: "hero" }]);
  });

  it("sends ViewContent for the plans only while the pixel is loaded", () => {
    trackMetaViewContent(["basico"]);
    expect(window.fbq).toBeUndefined();
    bootMetaPixel("123", "/", null);
    trackMetaViewContent(["basico", "pro"]);
    expect(calls().at(-1)).toEqual(["track", "ViewContent", { content_name: "Planos", content_type: "product", content_ids: ["basico", "pro"], currency: "BRL" }]);
  });
});
