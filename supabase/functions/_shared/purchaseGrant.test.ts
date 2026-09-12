import { describe, it, expect, vi } from "vitest";
import { approvePurchaseAndGrant, rejectPendingPurchase, type PurchaseRpcClient } from "./purchaseGrant";
import { CreditRpcError } from "./credits";

function fakeClient(result: { data: Record<string, unknown> | null; error: unknown }) {
  const rpc = vi.fn().mockResolvedValue(result);
  return { client: { rpc } as unknown as PurchaseRpcClient, rpc };
}

describe("approvePurchaseAndGrant", () => {
  it("calls the atomic RPC with the purchase and payment ids", async () => {
    const { client, rpc } = fakeClient({
      data: { success: true, granted: true, user_id: "u1", credits: 120, new_balance: 130 },
      error: null,
    });

    const result = await approvePurchaseAndGrant(client, { purchaseId: "p1", paymentId: "mp-9" });

    expect(rpc).toHaveBeenCalledWith("approve_purchase_and_grant", {
      p_purchase_id: "p1",
      p_payment_id: "mp-9",
    });
    expect(result).toEqual({ granted: true, userId: "u1", credits: 120, newBalance: 130 });
  });

  it("fills safe defaults when the RPC omits the grant details", async () => {
    const { client } = fakeClient({ data: { success: true, granted: true }, error: null });
    await expect(approvePurchaseAndGrant(client, { purchaseId: "p1", paymentId: "mp-9" })).resolves.toEqual({
      granted: true,
      userId: "",
      credits: 0,
      newBalance: 0,
    });
  });

  it("reports an already processed (or unknown) purchase without granting", async () => {
    const { client } = fakeClient({
      data: { success: true, granted: false, reason: "already_processed" },
      error: null,
    });

    await expect(approvePurchaseAndGrant(client, { purchaseId: "p1", paymentId: "mp-9" })).resolves.toEqual({
      granted: false,
      reason: "already_processed",
    });
  });

  it("throws a CreditRpcError on a transport error, so nobody answers 200 over a lost grant", async () => {
    const { client } = fakeClient({ data: null, error: { message: "db down" } });
    await expect(approvePurchaseAndGrant(client, { purchaseId: "p1", paymentId: "mp-9" })).rejects.toThrow(
      /db down/,
    );
  });

  it("throws a CreditRpcError when the RPC reports failure", async () => {
    const { client } = fakeClient({ data: { success: false, error: "user_not_found" }, error: null });
    await expect(approvePurchaseAndGrant(client, { purchaseId: "p1", paymentId: "mp-9" })).rejects.toBeInstanceOf(
      CreditRpcError,
    );
  });

  it("treats an empty payload as an error, never as a grant", async () => {
    const { client } = fakeClient({ data: null, error: null });
    await expect(approvePurchaseAndGrant(client, { purchaseId: "p1", paymentId: "mp-9" })).rejects.toBeInstanceOf(
      CreditRpcError,
    );
  });
});

describe("rejectPendingPurchase", () => {
  it("calls the RPC with the payment id and the MP detail", async () => {
    const { client, rpc } = fakeClient({ data: { success: true, rejected: true }, error: null });

    const result = await rejectPendingPurchase(client, {
      purchaseId: "p1",
      paymentId: "mp-9",
      statusDetail: "cc_rejected_other_reason",
    });

    expect(rpc).toHaveBeenCalledWith("reject_pending_purchase", {
      p_purchase_id: "p1",
      p_payment_id: "mp-9",
      p_status_detail: "cc_rejected_other_reason",
    });
    expect(result).toEqual({ rejected: true });
  });

  it("passes nulls through when the failure carries no payment id or detail", async () => {
    const { client, rpc } = fakeClient({ data: { success: true, rejected: false }, error: null });

    const result = await rejectPendingPurchase(client, { purchaseId: "p1", paymentId: null, statusDetail: null });

    expect(rpc).toHaveBeenCalledWith("reject_pending_purchase", {
      p_purchase_id: "p1",
      p_payment_id: null,
      p_status_detail: null,
    });
    expect(result).toEqual({ rejected: false });
  });

  it("throws when the RPC fails", async () => {
    const { client } = fakeClient({ data: null, error: { message: "db down" } });
    await expect(
      rejectPendingPurchase(client, { purchaseId: "p1", paymentId: "x", statusDetail: "d" }),
    ).rejects.toThrow(/db down/);
  });
});
