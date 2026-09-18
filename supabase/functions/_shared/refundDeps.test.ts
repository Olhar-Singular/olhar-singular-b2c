import { describe, it, expect, vi } from "vitest";
import { buildRefundDeps, type RefundAdminClient } from "./refundDeps";

function fakeAdmin(overrides: { rpcResults?: Record<string, { data: unknown; error: { message: string } | null }> } = {}) {
  const rpc = vi.fn(async (fn: string) => {
    const configured = overrides.rpcResults?.[fn];
    if (configured) return configured;
    return { data: { success: true }, error: null };
  });
  const client = { rpc } as unknown as RefundAdminClient;
  return { client, rpc };
}

function fakeFetch(status: number, json: unknown) {
  return vi.fn(async () => new Response(JSON.stringify(json), { status })) as unknown as typeof fetch;
}

const NOW = () => new Date("2026-09-18T10:00:00Z");

describe("buildRefundDeps", () => {
  describe("findRefundable", () => {
    it("calls refund_last_charge with the user id and shapes the eligible charge", async () => {
      const a = fakeAdmin({
        rpcResults: {
          refund_last_charge: {
            data: { success: true, invoice_id: "inv-1", mp_payment_id: "pay-1", amount_brl: 59.9, subscription_id: "sub-1", mp_preapproval_id: "pre-1" },
            error: null,
          },
        },
      });
      const deps = buildRefundDeps(a.client, "tok", fakeFetch(200, {}), NOW);
      const out = await deps.findRefundable("u1");
      expect(a.rpc).toHaveBeenCalledWith("refund_last_charge", { p_user_id: "u1" });
      expect(out).toEqual({
        invoiceId: "inv-1",
        mpPaymentId: "pay-1",
        amountBrl: 59.9,
        subscriptionId: "sub-1",
        mpPreapprovalId: "pre-1",
      });
    });

    it("returns null when the RPC reports nothing_to_refund", async () => {
      const a = fakeAdmin({ rpcResults: { refund_last_charge: { data: { success: false, error: "nothing_to_refund" }, error: null } } });
      const deps = buildRefundDeps(a.client, "tok", fakeFetch(200, {}), NOW);
      expect(await deps.findRefundable("u1")).toBeNull();
    });

    it("throws when the RPC errors", async () => {
      const a = fakeAdmin({ rpcResults: { refund_last_charge: { data: null, error: { message: "timeout" } } } });
      const deps = buildRefundDeps(a.client, "tok", fakeFetch(200, {}), NOW);
      await expect(deps.findRefundable("u1")).rejects.toThrow("refund_last_charge failed: timeout");
    });

    it("passes a null mp_preapproval_id through", async () => {
      const a = fakeAdmin({
        rpcResults: {
          refund_last_charge: {
            data: { success: true, invoice_id: "inv-1", mp_payment_id: "pay-1", amount_brl: 10, subscription_id: "sub-1", mp_preapproval_id: null },
            error: null,
          },
        },
      });
      const deps = buildRefundDeps(a.client, "tok", fakeFetch(200, {}), NOW);
      const out = await deps.findRefundable("u1");
      expect(out?.mpPreapprovalId).toBeNull();
    });
  });

  describe("postRefund", () => {
    it("POSTs to /v1/payments/{id}/refunds with the idempotency key and an empty body", async () => {
      const f = fakeFetch(201, { id: 999, status: "approved" });
      const deps = buildRefundDeps(fakeAdmin().client, "tok", f, NOW);
      const out = await deps.postRefund("pay 1", "refund:inv-1");
      expect(f).toHaveBeenCalledWith(
        "https://api.mercadopago.com/v1/payments/pay%201/refunds",
        expect.objectContaining({
          method: "POST",
          headers: { Authorization: "Bearer tok", "Content-Type": "application/json", "X-Idempotency-Key": "refund:inv-1" },
          body: JSON.stringify({}),
        }),
      );
      expect(out).toEqual({ ok: true, status: 201, refundId: "999", message: null });
    });

    it("reports a non-2xx with the MP message and no refund id", async () => {
      const f = fakeFetch(400, { message: "invalid payment id" });
      const deps = buildRefundDeps(fakeAdmin().client, "tok", f, NOW);
      const out = await deps.postRefund("pay-1", "refund:inv-1");
      expect(out).toEqual({ ok: false, status: 400, refundId: null, message: "invalid payment id" });
    });

    it("returns a null refundId and message when MP's body carries neither", async () => {
      const f = fakeFetch(201, {});
      const deps = buildRefundDeps(fakeAdmin().client, "tok", f, NOW);
      const out = await deps.postRefund("pay-1", "refund:inv-1");
      expect(out).toEqual({ ok: true, status: 201, refundId: null, message: null });
    });
  });

  describe("cancelPreapproval", () => {
    it("delegates to cancelPreapprovalAtMp with the token", async () => {
      const f = fakeFetch(200, { id: "pre-1", status: "cancelled" });
      const deps = buildRefundDeps(fakeAdmin().client, "tok", f, NOW);
      expect(await deps.cancelPreapproval("pre-1")).toBe(true);
      expect(f).toHaveBeenCalledWith(
        "https://api.mercadopago.com/preapproval/pre-1",
        expect.objectContaining({ method: "PUT", body: JSON.stringify({ status: "cancelled" }) }),
      );
    });

    it("never throws, reporting false when MP fails", async () => {
      const f = vi.fn(async () => { throw new Error("network down"); }) as unknown as typeof fetch;
      const deps = buildRefundDeps(fakeAdmin().client, "tok", f, NOW);
      expect(await deps.cancelPreapproval("pre-1")).toBe(false);
    });
  });

  describe("confirmRefund", () => {
    it("calls confirm_refund with the invoice and MP refund ids", async () => {
      const a = fakeAdmin({ rpcResults: { confirm_refund: { data: { success: true, already: false, subscription_id: "sub-1", credits_removed: 300 }, error: null } } });
      const deps = buildRefundDeps(a.client, "tok", fakeFetch(200, {}), NOW);
      const out = await deps.confirmRefund("inv-1", "ref-1");
      expect(a.rpc).toHaveBeenCalledWith("confirm_refund", { p_invoice_id: "inv-1", p_mp_refund_id: "ref-1" });
      expect(out).toEqual({ success: true, already: false, subscription_id: "sub-1", credits_removed: 300 });
    });

    it("throws when the RPC errors", async () => {
      const a = fakeAdmin({ rpcResults: { confirm_refund: { data: null, error: { message: "boom" } } } });
      const deps = buildRefundDeps(a.client, "tok", fakeFetch(200, {}), NOW);
      await expect(deps.confirmRefund("inv-1", "ref-1")).rejects.toThrow("confirm_refund failed: boom");
    });
  });

  it("logs through console.warn", () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => undefined);
    buildRefundDeps(fakeAdmin().client, "tok", fakeFetch(200, {}), NOW).log("hello", 1);
    expect(warn).toHaveBeenCalledWith("hello", 1);
    warn.mockRestore();
  });

  it("exposes now()", () => {
    const deps = buildRefundDeps(fakeAdmin().client, "tok", fakeFetch(200, {}), NOW);
    expect(deps.now()).toEqual(NOW());
  });

  it("defaults to the global fetch and clock", async () => {
    const globalFetch = vi.spyOn(globalThis, "fetch").mockResolvedValue(new Response("{}", { status: 200 }));
    const deps = buildRefundDeps(fakeAdmin().client, "tok");
    await deps.postRefund("pay-1", "refund:inv-1");
    expect(globalFetch).toHaveBeenCalled();
    expect(deps.now()).toBeInstanceOf(Date);
    globalFetch.mockRestore();
  });
});
