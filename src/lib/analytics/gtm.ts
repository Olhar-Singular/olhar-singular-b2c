// Google Tag Manager, injected at runtime and only where it is safe. The
// container is never loaded on the checkout or on the first-access password
// screen: a Custom HTML tag would run on the same origin that handles the
// session token, the e-mail, the CPF and the card token.

export const GTM_BLOCKED_PATHS = ["/assinar", "/definir-senha"];

let loadedId: string | null = null;

export function readGtmId(): string {
  return String(import.meta.env.VITE_GTM_ID || "").trim();
}

export function isGtmAllowedOn(pathname: string): boolean {
  return !GTM_BLOCKED_PATHS.some((blocked) => pathname === blocked || pathname.startsWith(`${blocked}/`));
}

/** Injects the container once. Returns whether it is (now) loaded. */
export function loadGtm(id: string, pathname: string, doc: Document = document): boolean {
  if (!id) return false;
  if (!isGtmAllowedOn(pathname)) return loadedId === id;
  if (loadedId === id) return true;

  window.dataLayer = window.dataLayer ?? [];
  window.dataLayer.push({ "gtm.start": Date.now(), event: "gtm.js" });
  const script = doc.createElement("script");
  script.async = true;
  script.src = `https://www.googletagmanager.com/gtm.js?id=${encodeURIComponent(id)}`;
  script.dataset.gtm = id;
  doc.head.appendChild(script);
  loadedId = id;
  return true;
}

/** Exposed for tests. */
export function resetGtm(): void {
  loadedId = null;
}
