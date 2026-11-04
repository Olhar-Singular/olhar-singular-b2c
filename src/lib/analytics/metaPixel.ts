// Meta Pixel loaded straight from the app (no GTM container needed). Same safety
// rule as GTM: never on the checkout or the first-access password screen, where
// the server (CAPI) is the only sender. By the owner's decision it does NOT wait
// for the cookie banner: events go out on every visit, accepted or not.

import { isGtmAllowedOn } from "@/lib/analytics/gtm";
import type { CtaOrigem } from "@/lib/analytics/events";

interface Fbq {
  (...args: unknown[]): void;
  callMethod?: (...args: unknown[]) => void;
  queue: unknown[][];
  push: Fbq | ((...args: unknown[]) => void);
  loaded: boolean;
  version: string;
}

declare global {
  interface Window {
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let loadedId: string | null = null;
let lastPath: string | null = null;

export function readMetaPixelId(): string {
  return String(import.meta.env.VITE_META_PIXEL_ID || "").trim();
}

// The stock Meta snippet: calls queue until fbevents.js defines callMethod.
function installFbq(): Fbq {
  if (window.fbq) return window.fbq;
  const fbq = ((...args: unknown[]) => {
    if (fbq.callMethod) fbq.callMethod(...args);
    else fbq.queue.push(args);
  }) as Fbq;
  fbq.push = fbq;
  fbq.loaded = true;
  fbq.version = "2.0";
  fbq.queue = [];
  window.fbq = fbq;
  window._fbq = fbq;
  return fbq;
}

/**
 * Runs on every navigation. Loads the pixel once and fires one PageView per
 * path. Returns whether the pixel is active here.
 */
export function bootMetaPixel(id: string, pathname: string, doc: Document = document): boolean {
  if (!id || !isGtmAllowedOn(pathname)) return false;
  const fbq = installFbq();

  if (loadedId !== id) {
    fbq("init", id);
    const script = doc.createElement("script");
    script.async = true;
    script.src = "https://connect.facebook.net/en_US/fbevents.js";
    script.dataset.metaPixel = id;
    doc.head.appendChild(script);
    loadedId = id;
  }

  if (pathname !== lastPath) {
    fbq("track", "PageView");
    lastPath = pathname;
  }
  return true;
}

/** Landing CTA click (7-day trial or subscribe) as the standard InitiateCheckout; the origin rides as a custom parameter. */
export function trackMetaInitiateCheckout(origem: CtaOrigem): void {
  if (loadedId && window.fbq) window.fbq("track", "InitiateCheckout", { origem });
}

/** The plans were shown to the visitor: the standard ViewContent over the plan catalogue. */
export function trackMetaViewContent(slugs: string[]): void {
  if (loadedId && window.fbq) {
    window.fbq("track", "ViewContent", { content_name: "Planos", content_type: "product", content_ids: slugs, currency: "BRL" });
  }
}

/** Exposed for tests. */
export function resetMetaPixel(): void {
  loadedId = null;
  lastPath = null;
}
