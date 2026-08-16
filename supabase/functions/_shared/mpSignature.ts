// Validates the Mercado Pago webhook HMAC signature.
//
// MP sends header  x-signature: ts=<ts>,v1=<hmac>, header  x-request-id, and the
// payment id as the query param  data.id. v1 is HMAC-SHA256, keyed by the webhook
// secret (VERIFY_TOKEN_MP_PROD), over the manifest:
//
//   id:<data.id lowercased>;request-id:<x-request-id>;ts:<ts>;
//
// A segment whose value is absent is omitted (MP's SDK does the same). An earlier
// version used `id:<id>;request-date:<ts>;`, which MP no longer signs, so every
// real webhook failed validation. Kept pure so every branch is unit-testable;
// uses Web Crypto, which runs in both Deno and the Vitest runtime.
export async function validateMpSignature(
  sigHeader: string | null,
  xRequestId: string | null,
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

  let manifest = `id:${dataId.toLowerCase()};`;
  if (xRequestId) manifest += `request-id:${xRequestId};`;
  manifest += `ts:${ts};`;

  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const buf = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(manifest));
  const hex = Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return hex === v1;
}
