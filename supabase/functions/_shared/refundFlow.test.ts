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
    getPaymentRefundState: vi.fn(async () => null),
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

  it("reports provider_error (permanent) when MP refuses the refund with a 4xx and never refunded it", async () => {
    const d = refundDeps({ postRefund: vi.fn(async () => ({ ok: false, status: 400, refundId: null, message: "invalid payment" })) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(result).toEqual({ ok: false, error: "provider_error", httpStatus: 502, permanent: true });
    expect(d.getPaymentRefundState).toHaveBeenCalledWith("pay-1");
    expect(d.confirmRefund).not.toHaveBeenCalled();
    expect(d.cancelPreapproval).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/MP refused/), 400, "invalid payment");
  });

  it("reports provider_error (not permanent) when MP is down with a 5xx and never refunded it", async () => {
    const d = refundDeps({ postRefund: vi.fn(async () => ({ ok: false, status: 503, refundId: null, message: "unavailable" })) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(result).toEqual({ ok: false, error: "provider_error", httpStatus: 502, permanent: false });
  });

  it("continues as a success when MP confirms the refund already landed after a non-2xx POST (replay after a failed confirm)", async () => {
    const d = refundDeps({
      postRefund: vi.fn(async () => ({ ok: false, status: 500, refundId: null, message: "timeout" })),
      getPaymentRefundState: vi.fn(async () => ({ refunded: true, refundId: "ref-99" })),
    });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.confirmRefund).toHaveBeenCalledWith("inv-1", "ref-99");
    expect(d.cancelPreapproval).toHaveBeenCalledWith("pre-1");
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/already existed/));
    expect(result).toEqual({
      ok: true,
      amountBrl: 59.9,
      refundedAt: "2026-09-18T10:00:00.000Z",
      subscriptionId: "sub-1",
      invoiceId: "inv-1",
      creditsRemoved: 300,
    });
  });

  it("falls back to 'unknown' when MP confirms the refund landed but reports no refund id", async () => {
    const d = refundDeps({
      postRefund: vi.fn(async () => ({ ok: false, status: 500, refundId: null, message: "timeout" })),
      getPaymentRefundState: vi.fn(async () => ({ refunded: true, refundId: null })),
    });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.confirmRefund).toHaveBeenCalledWith("inv-1", "unknown");
    expect(result.ok).toBe(true);
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

  it("retries the preapproval cancel once when it fails, without alerting when the retry succeeds", async () => {
    const cancelPreapproval = vi.fn().mockResolvedValueOnce(false).mockResolvedValueOnce(true);
    const d = refundDeps({ cancelPreapproval });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(cancelPreapproval).toHaveBeenCalledTimes(2);
    expect(d.log).not.toHaveBeenCalledWith(expect.stringMatching(/ALERT/), expect.anything());
    expect(d.confirmRefund).toHaveBeenCalledWith("inv-1", "ref-1");
    expect(result.ok).toBe(true);
  });

  it("logs an ALERT and still confirms the refund when the preapproval cancel fails even after the retry", async () => {
    const d = refundDeps({ cancelPreapproval: vi.fn(async () => false) });
    const result = await runRefundLastCharge({ userId: "u1" }, d);
    expect(d.cancelPreapproval).toHaveBeenCalledTimes(2);
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/ALERT preapproval not cancelled/), "pre-1");
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
