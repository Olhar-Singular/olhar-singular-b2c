import { describe, it, expect, vi } from "vitest";
import { runRefundLastCharge, type RefundDeps, type RefundableCharge } from "./refundFlow";

const CHARGE: RefundableCharge = {
  invoiceId: "inv-1",
  mpPaymentId: "pay-1",
  amountBrl: 59.9,
  subscriptionId: "sub-1",
  mpPreapprovalId: "pre-1",
};

const NOW = () => new Date("2026-09-18T10:00:00Z");

function refundDeps(overrides: Partial<RefundDeps> = {}) {
  const d = {
    findRefundable: vi.fn(async () => CHARGE),
    postRefund: vi.fn(async () => ({ ok: true, status: 201, refundId: "ref-1", message: null })),
    cancelPreapproval: vi.fn(async () => true),
    confirmRefund: vi.fn(async () => ({ success: true, already: false, subscription_id: "sub-1", credits_removed: 300 })),
    now: NOW,
    log: vi.fn(),
    ...overrides,
  };
  return d as RefundDeps & typeof d;
}

describe("runRefundLastCharge", () => {
  it("refuses with nothing_to_refund when there is no eligible charge, calling nothing else", async () => {
    const d = refundDeps({ findRefundable: vi.fn(async () => null) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(result).toEqual({ ok: false, error: "nothing_to_refund", httpStatus: 409 });
    expect(d.postRefund).not.toHaveBeenCalled();
    expect(d.cancelPreapproval).not.toHaveBeenCalled();
    expect(d.confirmRefund).not.toHaveBeenCalled();
  });

  it("reports provider_error when MP refuses the refund, without touching the DB or the preapproval", async () => {
    const d = refundDeps({ postRefund: vi.fn(async () => ({ ok: false, status: 400, refundId: null, message: "invalid payment" })) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(result).toEqual({ ok: false, error: "provider_error", httpStatus: 502 });
    expect(d.confirmRefund).not.toHaveBeenCalled();
    expect(d.cancelPreapproval).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/MP refused/), 400, "invalid payment");
  });

  it("cancels the preapproval, confirms the refund and returns the shaped result on a 2xx", async () => {
    const d = refundDeps();
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.cancelPreapproval).toHaveBeenCalledWith("pre-1");
    expect(d.confirmRefund).toHaveBeenCalledWith("inv-1", "ref-1");
    expect(result).toEqual({
      ok: true,
      amountBrl: 59.9,
      refundedAt: "2026-09-18T10:00:00.000Z",
      subscriptionId: "sub-1",
      invoiceId: "inv-1",
      creditsRemoved: 300,
    });
  });

  it("skips the preapproval cancel when the subscription never got one", async () => {
    const d = refundDeps({ findRefundable: vi.fn(async () => ({ ...CHARGE, mpPreapprovalId: null })) });
    await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.cancelPreapproval).not.toHaveBeenCalled();
  });

  it("only logs when the best-effort preapproval cancel fails, still confirming the refund", async () => {
    const d = refundDeps({ cancelPreapproval: vi.fn(async () => false) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/could not cancel/), "pre-1");
    expect(d.confirmRefund).toHaveBeenCalledWith("inv-1", "ref-1");
    expect(result.ok).toBe(true);
  });

  it("sends refund:<invoiceId> as the idempotency key", async () => {
    const d = refundDeps();
    await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.postRefund).toHaveBeenCalledWith("pay-1", "refund:inv-1");
  });

  it("still returns ok:true with creditsRemoved 0 when confirmRefund reports the invoice was already refunded (replay)", async () => {
    const d = refundDeps({ confirmRefund: vi.fn(async () => ({ success: true, already: true, subscription_id: "sub-1" })) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(result).toEqual({
      ok: true,
      amountBrl: 59.9,
      refundedAt: "2026-09-18T10:00:00.000Z",
      subscriptionId: "sub-1",
      invoiceId: "inv-1",
      creditsRemoved: 0,
    });
  });

  it("falls back to 'unknown' as the refund id when MP answers 2xx with no body, and logs it", async () => {
    const d = refundDeps({ postRefund: vi.fn(async () => ({ ok: true, status: 201, refundId: null, message: null })) });
    await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.confirmRefund).toHaveBeenCalledWith("inv-1", "unknown");
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/no refund id/));
  });

  it("defaults creditsRemoved to 0 when confirmRefund omits it", async () => {
    const d = refundDeps({ confirmRefund: vi.fn(async () => ({ success: true, already: false, subscription_id: "sub-1" })) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(result).toMatchObject({ ok: true, creditsRemoved: 0 });
  });

  it("propagates a confirmRefund failure so the caller replays the same idempotent POST", async () => {
    const d = refundDeps({ confirmRefund: vi.fn(async () => { throw new Error("db down"); }) });
    await expect(runRefundLastCharge({ userId: "u1" }, d)).rejects.toThrow("db down");
  });
});
