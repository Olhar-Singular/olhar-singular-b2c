import { describe, it, expect, vi } from "vitest";
import {
  publicPlanStatus,
  settleApprovedPlan,
  settleRefundedPlan,
  type PlanPurchaseRow,
  type PlanSettlementDeps,
  type SettleApprovedInput,
} from "./pixPlanSettlement";

const NOW = new Date("2026-11-15T15:00:00.000Z");
const ANON: PlanPurchaseRow = {
  kind: "plan",
  status: "pending",
  user_id: null,
  buyer_email: "ana@example.com",
  buyer_name: "Ana Souza",
  terms_version: "2026-11.1",
  plan_months: 3,
  amount_brl: "89.90",
  credits_granted: 900,
};
const GRANTED = {
  success: true,
  granted: true,
  user_id: "u-new",
  credits_now: 300,
  credits_locked: 600,
  unlock_at: "2026-11-22T15:00:00+00:00",
  period_end: "2027-02-15T15:00:00+00:00",
};

const INPUT: SettleApprovedInput = { purchaseId: "pur-1", paymentId: "987", appUrl: "https://app.example", now: NOW };

function deps(overrides: Partial<PlanSettlementDeps> = {}) {
  const d = {
    loadPurchase: vi.fn(async () => ANON as PlanPurchaseRow | null),
    userIdByEmail: vi.fn(async () => null as string | null),
    createUser: vi.fn(async () => ({ id: "u-new" }) as { id: string } | "exists"),
    loadContact: vi.fn(async () => ({ email: "u1@x.com", fullName: "Bia Lima" }) as { email: string; fullName: string | null } | null),
    approve: vi.fn(async () => GRANTED as Record<string, unknown>),
    sendLoginLink: vi.fn(async () => {}),
    sendConfirmation: vi.fn(async () => {}),
    log: vi.fn(),
    ...overrides,
  };
  return d as typeof d & PlanSettlementDeps;
}

describe("settleApprovedPlan", () => {
  it("ignores a purchase that is missing, not a plan or no longer pending", async () => {
    for (const row of [null, { ...ANON, kind: "extra" }, { ...ANON, status: "approved" }]) {
      const d = deps({ loadPurchase: vi.fn(async () => row as PlanPurchaseRow | null) });
      expect(await settleApprovedPlan(INPUT, d)).toEqual({ granted: false });
      expect(d.createUser).not.toHaveBeenCalled();
      expect(d.approve).not.toHaveBeenCalled();
    }
  });

  it("opens the account of an anonymous buyer, approves for it and sends the access link and the receipt", async () => {
    const d = deps();
    expect(await settleApprovedPlan(INPUT, d)).toEqual({ granted: true, userId: "u-new", accountCreated: true });
    expect(d.createUser).toHaveBeenCalledWith({ email: "ana@example.com", fullName: "Ana Souza" });
    expect(d.approve).toHaveBeenCalledWith("pur-1", "987", "u-new");
    expect(d.sendLoginLink).toHaveBeenCalledWith("ana@example.com");
    expect(d.sendConfirmation).toHaveBeenCalledWith({
      to: "ana@example.com",
      fullName: "Ana Souza",
      months: 3,
      credits: 900,
      creditsNow: 300,
      creditsLocked: 600,
      unlockAt: new Date("2026-11-22T15:00:00.000Z"),
      periodEnd: new Date("2027-02-15T15:00:00.000Z"),
      amountBrl: 89.9,
      paidAt: NOW,
      termsVersion: "2026-11.1",
      appUrl: "https://app.example",
    });
  });

  it("uses the account that already holds the e-mail (created between the QR and the payment)", async () => {
    const d = deps({ userIdByEmail: vi.fn(async () => "u-existing") });
    expect(await settleApprovedPlan(INPUT, d)).toEqual({ granted: true, userId: "u-existing", accountCreated: false });
    expect(d.createUser).not.toHaveBeenCalled();
    expect(d.approve).toHaveBeenCalledWith("pur-1", "987", "u-existing");
    expect(d.sendLoginLink).toHaveBeenCalledWith("ana@example.com");
  });

  it("re-reads the id when the account appears while it is being created", async () => {
    const userIdByEmail = vi.fn().mockResolvedValueOnce(null).mockResolvedValueOnce("u-raced");
    const d = deps({ userIdByEmail, createUser: vi.fn(async () => "exists" as const) });
    expect(await settleApprovedPlan(INPUT, d)).toEqual({ granted: true, userId: "u-raced", accountCreated: false });
    expect(d.approve).toHaveBeenCalledWith("pur-1", "987", "u-raced");
  });

  it("throws (so MP retries) when the account can be neither found nor created", async () => {
    const d = deps({ createUser: vi.fn(async () => "exists" as const) });
    await expect(settleApprovedPlan(INPUT, d)).rejects.toThrow(/account/);
    expect(d.approve).not.toHaveBeenCalled();
  });

  it("throws when a plan purchase has neither a user nor a buyer e-mail", async () => {
    const d = deps({ loadPurchase: vi.fn(async () => ({ ...ANON, buyer_email: null })) });
    await expect(settleApprovedPlan(INPUT, d)).rejects.toThrow(/buyer/);
  });

  it("sends nothing when the RPC did not grant (a concurrent webhook won)", async () => {
    const d = deps({ approve: vi.fn(async () => ({ success: true, granted: false, reason: "already_processed" })) });
    expect(await settleApprovedPlan(INPUT, d)).toEqual({ granted: false, userId: "u-new", accountCreated: true });
    expect(d.sendLoginLink).not.toHaveBeenCalled();
    expect(d.sendConfirmation).not.toHaveBeenCalled();
  });

  it("logged-in buyers get the receipt at their account e-mail and no access link", async () => {
    const d = deps({
      loadPurchase: vi.fn(async () => ({ ...ANON, user_id: "u1", buyer_email: null, buyer_name: null, terms_version: null })),
      approve: vi.fn(async () => ({ ...GRANTED, user_id: "u1", credits_now: 300, credits_locked: 0, unlock_at: null })),
    });
    expect(await settleApprovedPlan(INPUT, d)).toEqual({ granted: true, userId: "u1", accountCreated: false });
    expect(d.userIdByEmail).not.toHaveBeenCalled();
    expect(d.sendLoginLink).not.toHaveBeenCalled();
    expect(d.loadContact).toHaveBeenCalledWith("u1");
    expect(d.sendConfirmation).toHaveBeenCalledWith(
      expect.objectContaining({ to: "u1@x.com", fullName: "Bia Lima", creditsLocked: 0, unlockAt: null, termsVersion: null }),
    );
  });

  it("skips the receipt of a logged-in buyer whose contact is gone", async () => {
    const d = deps({
      loadPurchase: vi.fn(async () => ({ ...ANON, user_id: "u1", buyer_email: null })),
      loadContact: vi.fn(async () => null),
    });
    expect(await settleApprovedPlan(INPUT, d)).toMatchObject({ granted: true });
    expect(d.sendConfirmation).not.toHaveBeenCalled();
    expect(d.log).toHaveBeenCalled();
  });

  it("a failed link or receipt is logged, never undoes the approval", async () => {
    const d = deps({
      sendLoginLink: vi.fn(async () => { throw new Error("otp down"); }),
      sendConfirmation: vi.fn(async () => { throw new Error("resend down"); }),
    });
    expect(await settleApprovedPlan(INPUT, d)).toEqual({ granted: true, userId: "u-new", accountCreated: true });
    expect(d.log).toHaveBeenCalledTimes(2);
  });

  it("logs a non-Error rejection as it came", async () => {
    const d = deps({
      sendLoginLink: vi.fn(() => Promise.reject("otp down")),
      sendConfirmation: vi.fn(() => Promise.reject("resend down")),
    });
    await settleApprovedPlan(INPUT, d);
    expect(d.log).toHaveBeenCalledWith(expect.any(String), "pur-1", "otp down");
    expect(d.log).toHaveBeenCalledWith(expect.any(String), "pur-1", "resend down");
  });

  it("defaults the payment date to now", async () => {
    const d = deps();
    await settleApprovedPlan({ purchaseId: "pur-1", paymentId: "987", appUrl: "https://app.example" }, d);
    const sent = (d.sendConfirmation.mock.calls[0] as unknown as [{ paidAt: Date }])[0];
    expect(sent.paidAt).toBeInstanceOf(Date);
  });
});

describe("settleRefundedPlan", () => {
  it("calls the refund RPC and reports what it removed", async () => {
    const refund = vi.fn(async () => ({ success: true, refunded: true, credits_removed: 300 }));
    expect(await settleRefundedPlan({ purchaseId: "pur-1", paymentId: "987" }, { refund })).toEqual({ refunded: true, creditsRemoved: 300 });
    expect(refund).toHaveBeenCalledWith("pur-1", "987");
  });

  it("reports nothing removed when the purchase was already refunded", async () => {
    const refund = vi.fn(async () => ({ success: true, refunded: false }));
    expect(await settleRefundedPlan({ purchaseId: "pur-1", paymentId: "987" }, { refund })).toEqual({ refunded: false, creditsRemoved: 0 });
  });
});

describe("publicPlanStatus", () => {
  it("maps the purchase to what the paying screen needs", () => {
    expect(publicPlanStatus({ kind: "plan", status: "pending" })).toBe("pending");
    expect(publicPlanStatus({ kind: "plan", status: "approved" })).toBe("approved");
    for (const status of ["rejected", "cancelled", "refunded"]) {
      expect(publicPlanStatus({ kind: "plan", status })).toBe("failed");
    }
  });

  it("does not answer for a missing row or another kind of purchase", () => {
    expect(publicPlanStatus(null)).toBeNull();
    expect(publicPlanStatus({ kind: "extra", status: "approved" })).toBeNull();
  });
});
