import { describe, it, expect } from "vitest";
import { canAfford, computeAccess, parseIsoOrNull, type AccessProfile } from "./access";

const NOW = new Date("2026-09-12T12:00:00Z");

function profile(overrides: Partial<AccessProfile> = {}): AccessProfile {
  return {
    access_kind: "subscriber",
    plan_credits: 0,
    plan_period_end: null,
    credit_balance: 0,
    trial_started_at: null,
    must_set_password: false,
    ...overrides,
  };
}

describe("parseIsoOrNull", () => {
  it("parses an ISO timestamp", () => {
    expect(parseIsoOrNull("2026-09-20T00:00:00Z")?.getTime()).toBe(Date.UTC(2026, 8, 20));
  });

  it("returns null for null, undefined, empty and garbage", () => {
    expect(parseIsoOrNull(null)).toBeNull();
    expect(parseIsoOrNull(undefined)).toBeNull();
    expect(parseIsoOrNull("")).toBeNull();
    expect(parseIsoOrNull("not a date")).toBeNull();
  });
});

describe("computeAccess", () => {
  it("returns null while the profile has not loaded", () => {
    expect(computeAccess(null, NOW)).toBeNull();
  });

  it("counts the plan bucket only while the period is in the future", () => {
    const active = computeAccess(
      profile({ plan_credits: 40, plan_period_end: "2026-09-20T00:00:00Z", credit_balance: 5 }),
      NOW,
    );
    expect(active).toMatchObject({ kind: "subscriber", planCredits: 40, extraCredits: 5, total: 45, paywalled: false });
    expect(active?.periodEnd?.toISOString()).toBe("2026-09-20T00:00:00.000Z");

    const expired = computeAccess(
      profile({ plan_credits: 40, plan_period_end: "2026-09-01T00:00:00Z", credit_balance: 5 }),
      NOW,
    );
    expect(expired).toMatchObject({ planCredits: 0, extraCredits: 5, total: 5, paywalled: false });
  });

  it("ignores plan credits when there is no period at all", () => {
    expect(computeAccess(profile({ plan_credits: 40, credit_balance: 0 }), NOW)).toMatchObject({
      planCredits: 0,
      total: 0,
      paywalled: true,
    });
  });

  it("is paywalled when nothing is available and the account is not exempt", () => {
    expect(computeAccess(profile({ access_kind: "legacy" }), NOW)).toMatchObject({
      kind: "legacy",
      total: 0,
      paywalled: true,
      unlimited: false,
    });
  });

  it("is unlimited and never paywalled when exempt", () => {
    expect(computeAccess(profile({ access_kind: "exempt" }), NOW)).toMatchObject({
      kind: "exempt",
      unlimited: true,
      paywalled: false,
      total: 0,
    });
  });

  it("reports the days left of a running trial", () => {
    const access = computeAccess(
      profile({
        access_kind: "trial",
        plan_credits: 50,
        plan_period_end: "2026-09-15T18:00:00Z",
        trial_started_at: "2026-09-08T18:00:00Z",
      }),
      NOW,
    );
    expect(access).toMatchObject({ kind: "trial", daysLeft: 4, trialExpired: false, planCredits: 50 });
  });

  it("flags an expired trial and keeps only the extras", () => {
    const access = computeAccess(
      profile({
        access_kind: "trial",
        plan_credits: 20,
        plan_period_end: "2026-09-10T00:00:00Z",
        trial_started_at: "2026-09-03T00:00:00Z",
        credit_balance: 3,
      }),
      NOW,
    );
    expect(access).toMatchObject({ trialExpired: true, daysLeft: 0, planCredits: 0, total: 3, paywalled: false });
  });

  it("does not report days left for non-trial accounts", () => {
    const access = computeAccess(
      profile({ plan_credits: 10, plan_period_end: "2026-09-20T00:00:00Z" }),
      NOW,
    );
    expect(access?.daysLeft).toBeNull();
    expect(access?.trialExpired).toBe(false);
  });

  it("falls back to subscriber for an unknown access_kind", () => {
    expect(computeAccess(profile({ access_kind: "weird" }), NOW)?.kind).toBe("subscriber");
  });

  it("carries must_set_password through", () => {
    expect(computeAccess(profile({ must_set_password: true }), NOW)?.mustSetPassword).toBe(true);
  });
});

describe("canAfford", () => {
  it("is false while the access is unknown", () => {
    expect(canAfford(null, 5)).toBe(false);
  });

  it("is true for exempt accounts regardless of balance", () => {
    expect(canAfford(computeAccess(profile({ access_kind: "exempt" }), NOW), 999)).toBe(true);
  });

  it("compares the cost against the total available", () => {
    const access = computeAccess(
      profile({ plan_credits: 3, plan_period_end: "2026-09-20T00:00:00Z", credit_balance: 2 }),
      NOW,
    );
    expect(canAfford(access, 5)).toBe(true);
    expect(canAfford(access, 6)).toBe(false);
  });
});
