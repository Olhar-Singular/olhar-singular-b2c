import { initMercadoPago } from "@mercadopago/sdk-react";

// initMercadoPago keeps module state inside the SDK and warns when called
// again; remember the key we initialized with so every Brick on the page shares
// one instance. Lives outside the component file so React Fast Refresh keeps
// working (component files must only export components).
let initializedKey: string | null = null;

/** Initializes the MP SDK for the given public key at most once per key. */
export function ensureMercadoPago(publicKey: string): void {
  if (!publicKey || initializedKey === publicKey) return;
  initMercadoPago(publicKey, { locale: "pt-BR" });
  initializedKey = publicKey;
}

/** Exposed for tests: the SDK keeps module state, so a test can reset it. */
export function resetMpInit(): void {
  initializedKey = null;
}

export function readMpPublicKey(): string {
  return (import.meta.env.VITE_MP_PUBLIC_KEY ?? "").trim();
}
