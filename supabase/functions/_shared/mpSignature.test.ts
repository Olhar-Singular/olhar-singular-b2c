import { describe, it, expect } from "vitest";
import { validateMpSignature } from "./mpSignature";

const SECRET = "test-webhook-secret";
const DATA_ID = "123456";
const REQ_ID = "req-abc-123";

// Rebuild the exact manifest MP signs, so the test is deterministic without a
// hardcoded hex blob: id:<data.id lowercased>;[request-id:<x-request-id>;]ts:<ts>;
async function sign(
  dataId: string,
  ts: string,
  secret: string,
  xRequestId?: string,
): Promise<string> {
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
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("validateMpSignature", () => {
  it("accepts a header signed with the current MP manifest (id + request-id + ts)", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, SECRET, REQ_ID);
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, REQ_ID, DATA_ID, SECRET)).toBe(true);
  });

  it("omits the request-id segment when there is no x-request-id header", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, SECRET);
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, null, DATA_ID, SECRET)).toBe(true);
  });

  it("lowercases the data.id in the manifest, matching MP", async () => {
    const ts = "1700000000";
    const v1 = await sign("ABC123", ts, SECRET, REQ_ID); // sign lowercases internally
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, REQ_ID, "ABC123", SECRET)).toBe(true);
  });

  it("rejects a signature forged with the wrong secret", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, "wrong-secret", REQ_ID);
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, REQ_ID, DATA_ID, SECRET)).toBe(false);
  });

  it("rejects a valid signature replayed for a different payment id", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, SECRET, REQ_ID);
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, REQ_ID, "999", SECRET)).toBe(false);
  });

  it("rejects when the request-id differs from what was signed", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, SECRET, REQ_ID);
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, "other-req", DATA_ID, SECRET)).toBe(false);
  });

  it("rejects when the header is absent", async () => {
    expect(await validateMpSignature(null, REQ_ID, DATA_ID, SECRET)).toBe(false);
  });

  it("rejects when ts or v1 is missing from the header", async () => {
    expect(await validateMpSignature("v1=abc", REQ_ID, DATA_ID, SECRET)).toBe(false);
    expect(await validateMpSignature("ts=1700000000", REQ_ID, DATA_ID, SECRET)).toBe(false);
  });
});
