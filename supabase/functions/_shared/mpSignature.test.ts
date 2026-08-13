import { describe, it, expect } from "vitest";
import { validateMpSignature } from "./mpSignature";

const SECRET = "test-webhook-secret";
const DATA_ID = "123456";

// Compute the signature MP would send, so the test is deterministic without a
// hardcoded hex blob: same message format the validator rebuilds internally.
async function sign(dataId: string, ts: string, secret: string): Promise<string> {
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
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

describe("validateMpSignature", () => {
  it("accepts a header signed with the shared secret", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, SECRET);
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, DATA_ID, SECRET)).toBe(true);
  });

  it("rejects a signature forged with the wrong secret", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, "wrong-secret");
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, DATA_ID, SECRET)).toBe(false);
  });

  it("rejects a valid signature replayed for a different payment id", async () => {
    const ts = "1700000000";
    const v1 = await sign(DATA_ID, ts, SECRET);
    expect(await validateMpSignature(`ts=${ts},v1=${v1}`, "999", SECRET)).toBe(false);
  });

  it("rejects when the header is absent", async () => {
    expect(await validateMpSignature(null, DATA_ID, SECRET)).toBe(false);
  });

  it("rejects when ts or v1 is missing from the header", async () => {
    expect(await validateMpSignature("v1=abc", DATA_ID, SECRET)).toBe(false);
    expect(await validateMpSignature("ts=1700000000", DATA_ID, SECRET)).toBe(false);
  });
});
