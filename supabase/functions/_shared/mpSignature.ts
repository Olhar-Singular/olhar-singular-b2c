// Validates the Mercado Pago webhook HMAC signature. MP sends the header
//   x-signature: ts=<timestamp>,v1=<hmac>
// where v1 is HMAC-SHA256, over the message `id:<dataId>;request-date:<ts>;`,
// keyed by the webhook secret (VERIFY_TOKEN_MP). Kept pure (no Request object)
// so every branch is unit-testable; uses Web Crypto, which runs in both Deno
// and the Vitest runtime.
export async function validateMpSignature(
  sigHeader: string | null,
  dataId: string,
  secret: string,
): Promise<boolean> {
  if (!sigHeader) return false;

  const parts = Object.fromEntries(
    sigHeader.split(",").map((p) => p.split("=") as [string, string]),
  );
  const ts = parts["ts"];
  const v1 = parts["v1"];
  if (!ts || !v1) return false;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign(
    "HMAC",
    key,
    new TextEncoder().encode(`id:${dataId};request-date:${ts};`),
  );
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex === v1;
}
