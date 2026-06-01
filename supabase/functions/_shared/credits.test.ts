import { describe, it, expect, vi } from "vitest";
import {
  chargeCredits,
  chargeErrorResponse,
  refundCredits,
  type ChargeOutcome,
} from "./credits";

describe("chargeCredits", () => {
  it("returns 'free' and does not deduct when the free slot is claimed", async () => {
    const deduct = vi.fn();
    const outcome = await chargeCredits({
      cost: 8,
      claimFree: () => Promise.resolve(true),
      deduct,
    });
    expect(outcome).toEqual({ status: "free", creditsCharged: 0 });
    expect(deduct).not.toHaveBeenCalled();
  });

  it("charges the cost and reports the new balance on a successful deduct", async () => {
    const outcome = await chargeCredits({
      cost: 8,
      claimFree: () => Promise.resolve(false),
      deduct: () => Promise.resolve({ data: { success: true, new_balance: 42 }, error: null }),
    });
    expect(outcome).toEqual({ status: "charged", creditsCharged: 8, newBalance: 42 });
  });

  it("defaults newBalance to 0 when the RPC omits it", async () => {
    const outcome = await chargeCredits({
      cost: 5,
      claimFree: () => Promise.resolve(false),
      deduct: () => Promise.resolve({ data: {}, error: null }),
    });
    expect(outcome).toEqual({ status: "charged", creditsCharged: 5, newBalance: 0 });
  });

  it("returns 'error' (reason rpc, with cause) when the RPC call itself errors", async () => {
    const cause = { message: "boom" };
    const outcome = await chargeCredits({
      cost: 8,
      claimFree: () => Promise.resolve(false),
      deduct: () => Promise.resolve({ data: null, error: cause }),
    });
    expect(outcome).toEqual({ status: "error", reason: "rpc", cause });
  });

  it("returns 'insufficient' with the echoed balance", async () => {
    const outcome = await chargeCredits({
      cost: 12,
      claimFree: () => Promise.resolve(false),
      deduct: () =>
        Promise.resolve({ data: { success: false, error: "insufficient_credits", balance: 3 }, error: null }),
    });
    expect(outcome).toEqual({ status: "insufficient", balance: 3 });
  });

  it("returns 'insufficient' with null balance when the RPC omits it", async () => {
    const outcome = await chargeCredits({
      cost: 12,
      claimFree: () => Promise.resolve(false),
      deduct: () => Promise.resolve({ data: { success: false, error: "insufficient_credits" }, error: null }),
    });
    expect(outcome).toEqual({ status: "insufficient", balance: null });
  });

  it("returns 'error' (reason failure) for any other unsuccessful RPC result", async () => {
    const outcome = await chargeCredits({
      cost: 8,
      claimFree: () => Promise.resolve(false),
      deduct: () => Promise.resolve({ data: { success: false, error: "user_not_found" }, error: null }),
    });
    expect(outcome).toEqual({ status: "error", reason: "failure" });
  });
});

describe("chargeErrorResponse", () => {
  it("maps 'insufficient' to a 402 with balance and required cost", () => {
    const res = chargeErrorResponse({ status: "insufficient", balance: 3 }, 8);
    expect(res).toEqual({
      status: 402,
      body: { error: "Créditos insuficientes.", balance: 3, required: 8 },
    });
  });

  it("maps 'error' to a generic 500 regardless of reason", () => {
    expect(chargeErrorResponse({ status: "error", reason: "rpc" }, 8)).toEqual({
      status: 500,
      body: { error: "Erro ao processar créditos." },
    });
    expect(chargeErrorResponse({ status: "error", reason: "failure" }, 8)).toEqual({
      status: 500,
      body: { error: "Erro ao processar créditos." },
    });
  });

  it("returns null for 'free' so the caller proceeds", () => {
    expect(chargeErrorResponse({ status: "free", creditsCharged: 0 }, 8)).toBeNull();
  });

  it("returns null for 'charged' so the caller proceeds", () => {
    const outcome: ChargeOutcome = { status: "charged", creditsCharged: 8, newBalance: 42 };
    expect(chargeErrorResponse(outcome, 8)).toBeNull();
  });
});

describe("refundCredits", () => {
  it("does not grant anything when nothing was charged", async () => {
    const grant = vi.fn(() => Promise.resolve());
    await refundCredits({ creditsCharged: 0, grant });
    expect(grant).not.toHaveBeenCalled();
  });

  it("grants the charged amount back", async () => {
    const grant = vi.fn(() => Promise.resolve());
    await refundCredits({ creditsCharged: 8, grant });
    expect(grant).toHaveBeenCalledWith(8);
  });

  it("reports a refund failure via onError instead of throwing", async () => {
    const err = new Error("grant failed");
    const onError = vi.fn();
    await expect(
      refundCredits({ creditsCharged: 8, grant: () => Promise.reject(err), onError }),
    ).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(err);
  });

  it("swallows a refund failure even without an onError handler", async () => {
    await expect(
      refundCredits({ creditsCharged: 8, grant: () => Promise.reject(new Error("x")) }),
    ).resolves.toBeUndefined();
  });
});
