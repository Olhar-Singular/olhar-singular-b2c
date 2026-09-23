// Thin layer over window.dataLayer / gtag. Everything is tolerant to the tag
// manager being absent (no VITE_GTM_ID, blocked by the browser, or the
// checkout routes where it is never loaded): pushes just accumulate.

import type { Consent } from "@/lib/analytics/consent";

type DataLayerEntry = Record<string, unknown> | unknown[];

declare global {
  interface Window {
    dataLayer?: DataLayerEntry[];
    gtag?: (...args: unknown[]) => void;
  }
}

// Browser only (Vite app): window always exists here.
function layer(): DataLayerEntry[] {
  window.dataLayer = window.dataLayer ?? [];
  return window.dataLayer;
}

// The standard gtag shim: arguments are pushed as an array so GTM's consent
// APIs see them even before the container loads.
function gtag(...args: unknown[]): void {
  const dl = layer();
  if (typeof window.gtag === "function") {
    window.gtag(...args);
    return;
  }
  dl.push(args);
}

/** Pushes a GA4-style event. Never carries e-mail, CPF or card data. */
export function pushEvent(event: string, params: Record<string, unknown> = {}): void {
  layer().push({ event, ...params });
}

export function gtagConsentDefault(consent: Consent): void {
  gtag("consent", "default", { ...consent, wait_for_update: 500 });
}

export function gtagConsentUpdate(consent: Consent): void {
  gtag("consent", "update", { ...consent });
}

/** Exposed for tests. */
export function resetDataLayer(): void {
  window.dataLayer = [];
  delete window.gtag;
}
