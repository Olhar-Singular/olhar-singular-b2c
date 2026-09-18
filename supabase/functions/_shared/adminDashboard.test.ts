import { describe, it, expect } from "vitest";
import {
  maskCpf,
  isUserActive,
  shapeSeries,
  mergeUserRows,
  pickSubscriptionPerUser,
  pickLastChargePerSubscription,
  summarizeSubscriptions,
  type SubscriptionLite,
  type AuthUserLite,
  type ProfileLite,
  type SpendingLite,
  type InvoiceLite,
} from "./adminDashboard";

const NOW = new Date("2026-06-01T12:00:00Z");

describe("isUserActive", () => {
  it("is active when there is no ban", () => {
    expect(isUserActive(null, NOW)).toBe(true);
    expect(isUserActive(undefined, NOW)).toBe(true);
  });

  it("is active when banned_until is unparseable", () => {
    expect(isUserActive("not-a-date", NOW)).toBe(true);
  });

  it("is active when the ban has already expired", () => {
    expect(isUserActive("2026-05-01T00:00:00Z", NOW)).toBe(true);
  });

  it("is inactive when banned until a future date", () => {
    expect(isUserActive("2030-01-01T00:00:00Z", NOW)).toBe(false);
  });
});

describe("shapeSeries", () => {
  it("coerces string/null costs to numbers", () => {
    expect(
      shapeSeries([
        { bucket: "2026-06-01T00:00:00Z", cost: "1.5" },
        { bucket: "2026-06-02T00:00:00Z", cost: 2 },
        { bucket: "2026-06-03T00:00:00Z", cost: null },
      ]),
    ).toEqual([
      { bucket: "2026-06-01T00:00:00Z", cost: 1.5 },
      { bucket: "2026-06-02T00:00:00Z", cost: 2 },
      { bucket: "2026-06-03T00:00:00Z", cost: 0 },
    ]);
  });

  it("returns an empty array for no rows", () => {
    expect(shapeSeries([])).toEqual([]);
  });
});

describe("mergeUserRows", () => {
  const authUsers: AuthUserLite[] = [
    {
      id: "u1",
      email: "a@x.com",
      last_sign_in_at: "2026-05-30T00:00:00Z",
      banned_until: null,
      created_at: "2026-01-01T00:00:00Z",
    },
    {
      id: "u2",
      email: "b@x.com",
      last_sign_in_at: null,
      banned_until: "2030-01-01T00:00:00Z",
      created_at: "2026-02-01T00:00:00Z",
    },
    { id: "u3" },
  ];
  const profiles: ProfileLite[] = [
    {
      id: "u1", full_name: "Alice", credit_balance: 42, is_super_admin: true,
      access_kind: "exempt", plan_credits: 0, plan_period_end: null, trial_started_at: null, cpf: "12345678909",
    },
    {
      id: "u2", full_name: "Bob", credit_balance: 0, is_super_admin: false,
      access_kind: "trial", plan_credits: 50, plan_period_end: "2026-06-06T00:00:00Z",
      trial_started_at: "2026-05-30T00:00:00Z", cpf: null,
    },
  ];
  const spending: SpendingLite[] = [
    { user_id: "u1", total_usd: "0.0123" },
    { user_id: "u2", total_usd: 5 },
    { user_id: "u-null", total_usd: null },
  ];

  it("joins auth users with profile and spending data", () => {
    const rows = mergeUserRows(authUsers, profiles, spending, NOW);
    expect(rows[0]).toEqual({
      id: "u1",
      email: "a@x.com",
      full_name: "Alice",
      credit_balance: 42,
      plan_credits: 0,
      plan_period_end: null,
      access_kind: "exempt",
      trial_started_at: null,
      cpf_masked: "***.***.***-09",
      total_usd: 0.0123,
      last_sign_in_at: "2026-05-30T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      is_active: true,
      is_super_admin: true,
      subscription: null,
    });
  });

  it("carries the trial bucket and period through", () => {
    const rows = mergeUserRows(authUsers, profiles, spending, NOW);
    expect(rows[1]).toMatchObject({
      access_kind: "trial",
      plan_credits: 50,
      plan_period_end: "2026-06-06T00:00:00Z",
      trial_started_at: "2026-05-30T00:00:00Z",
      cpf_masked: null,
    });
  });

  it("marks a user banned into the future as inactive", () => {
    const rows = mergeUserRows(authUsers, profiles, spending, NOW);
    expect(rows[1].is_active).toBe(false);
  });

  it("falls back to defaults when profile and spending are missing", () => {
    const rows = mergeUserRows(authUsers, profiles, spending, NOW);
    expect(rows[2]).toEqual({
      id: "u3",
      email: null,
      full_name: null,
      credit_balance: 0,
      plan_credits: 0,
      plan_period_end: null,
      access_kind: "subscriber",
      trial_started_at: null,
      cpf_masked: null,
      total_usd: 0,
      last_sign_in_at: null,
      created_at: null,
      is_active: true,
      is_super_admin: false,
      subscription: null,
    });
  });

  it("masks the CPF to its last two digits and tolerates malformed values", () => {
    expect(maskCpf("12345678909")).toBe("***.***.***-09");
    expect(maskCpf("")).toBeNull();
    expect(maskCpf(null)).toBeNull();
    expect(maskCpf("12")).toBe("***.***.***-12");
  });

  it("returns an empty array when there are no users", () => {
    expect(mergeUserRows([], profiles, spending, NOW)).toEqual([]);
  });
});

describe("subscriptions on the dashboard", () => {
  const PRO = { name: "Profissional", price_brl: "59.90" };
  const BASIC = { name: "Básico", price_brl: 39.9 };
  const rows: SubscriptionLite[] = [
    { user_id: "u1", status: "cancelled", created_at: "2026-01-01T00:00:00Z", plans: BASIC },
    { user_id: "u1", status: "authorized", created_at: "2026-02-01T00:00:00Z", next_payment_date: "2026-07-01T00:00:00Z", mp_preapproval_id: "pre-1", plans: PRO },
    { user_id: "u2", status: "rejected", created_at: "2026-03-01T00:00:00Z", plans: BASIC },
    { user_id: "u2", status: "rejected", created_at: "2026-04-01T00:00:00Z", plans: PRO },
    { user_id: "u3", status: "past_due", created_at: "2026-04-01T00:00:00Z", plans: BASIC },
    { user_id: "u4", status: "authorized", created_at: "2026-04-01T00:00:00Z", plans: null },
  ];

  it("picks the live subscription over closed ones, and the newest among equals", () => {
    const picked = pickSubscriptionPerUser(rows);
    expect(picked.get("u1")).toEqual({
      status: "authorized", plan_name: "Profissional", price_brl: 59.9,
      next_payment_date: "2026-07-01T00:00:00Z", current_period_end: null, mp_preapproval_id: "pre-1",
      trial_ends_at: null, first_payment_confirmed: false, last_charge: null,
    });
    expect(picked.get("u2")).toMatchObject({ status: "rejected", plan_name: "Profissional" });
    expect(picked.get("u4")).toMatchObject({ plan_name: null, price_brl: 0 });
    expect(picked.get("nobody")).toBeUndefined();
  });

  it("keeps the first row when an unknown status ties and the other is not newer", () => {
    const picked = pickSubscriptionPerUser([
      { user_id: "u9", status: "weird", created_at: "2026-02-01T00:00:00Z", plans: PRO },
      { user_id: "u9", status: "weird", plans: BASIC },
      { user_id: "u9", status: "weird", created_at: "2026-01-01T00:00:00Z", plans: BASIC },
    ]);
    expect(picked.get("u9")).toMatchObject({ plan_name: "Profissional" });
    const undated = pickSubscriptionPerUser([
      { user_id: "u8", status: "pending", plans: BASIC },
      { user_id: "u8", status: "pending", created_at: "2026-01-01T00:00:00Z", plans: PRO },
    ]);
    // No date on the current row: nothing can be "newer" than it, so it stays.
    expect(undated.get("u8")).toMatchObject({ plan_name: "Básico" });
  });

  it("summarises counts, live total and MRR from authorized plans", () => {
    expect(summarizeSubscriptions(rows)).toEqual({
      by_status: { cancelled: 1, authorized: 2, rejected: 2, past_due: 1 },
      mrr_brl: 59.9,
      live: 3,
    });
    expect(summarizeSubscriptions([])).toEqual({ by_status: {}, mrr_brl: 0, live: 0 });
  });

  it("attaches the subscription to the user row (null when never subscribed)", () => {
    const users = mergeUserRows(
      [{ id: "u1" }, { id: "u5" }],
      [],
      [],
      NOW,
      rows,
    );
    expect(users[0].subscription).toMatchObject({ status: "authorized" });
    expect(users[1].subscription).toBeNull();
    expect(mergeUserRows([{ id: "u1" }], [], [], NOW)[0].subscription).toBeNull();
  });

  it("propagates trial_ends_at and first_payment_confirmed, defaulting to null/false", () => {
    const cardTrialRows: SubscriptionLite[] = [
      {
        id: "sub-1", user_id: "u1", status: "authorized", created_at: "2026-02-01T00:00:00Z",
        trial_ends_at: "2026-06-10T00:00:00Z", first_payment_confirmed: false, plans: PRO,
      },
    ];
    const users = mergeUserRows([{ id: "u1" }, { id: "u5" }], [], [], NOW, cardTrialRows);
    expect(users[0].subscription).toMatchObject({
      trial_ends_at: "2026-06-10T00:00:00Z",
      first_payment_confirmed: false,
    });
    // No subscription at all -> no card-trial fields to propagate.
    expect(users[1].subscription).toBeNull();
    // A subscription without trial fields defaults to null/false.
    expect(mergeUserRows([{ id: "u1" }], [], [], NOW, rows)[0].subscription).toMatchObject({
      trial_ends_at: null,
      first_payment_confirmed: false,
    });
  });
});

describe("pickLastChargePerSubscription", () => {
  it("keeps the most recent invoice per subscription by debit_date", () => {
    const invoices: InvoiceLite[] = [
      { subscription_id: "sub-1", amount_brl: 39.9, debit_date: "2026-05-01T00:00:00Z", refunded_at: null },
      { subscription_id: "sub-1", amount_brl: "59.90", debit_date: "2026-06-01T00:00:00Z", refunded_at: null },
      { subscription_id: "sub-2", amount_brl: 99.9, debit_date: "2026-04-01T00:00:00Z", refunded_at: "2026-04-05T00:00:00Z" },
    ];
    const picked = pickLastChargePerSubscription(invoices);
    expect(picked.get("sub-1")).toEqual({ amount_brl: 59.9, debit_date: "2026-06-01T00:00:00Z", refunded_at: null });
    expect(picked.get("sub-2")).toEqual({ amount_brl: 99.9, debit_date: "2026-04-01T00:00:00Z", refunded_at: "2026-04-05T00:00:00Z" });
    expect(picked.get("nobody")).toBeUndefined();
  });

  it("keeps the current row when a later one has no debit_date to compare", () => {
    const picked = pickLastChargePerSubscription([
      { subscription_id: "sub-1", amount_brl: 39.9, debit_date: "2026-05-01T00:00:00Z", refunded_at: null },
      { subscription_id: "sub-1", amount_brl: 1, debit_date: null, refunded_at: null },
    ]);
    expect(picked.get("sub-1")).toMatchObject({ amount_brl: 39.9 });
  });

  it("replaces an undated row seen first once a real-dated row shows up (order is not guaranteed by the query)", () => {
    const picked = pickLastChargePerSubscription([
      { subscription_id: "sub-1", amount_brl: 1, debit_date: null, refunded_at: null },
      { subscription_id: "sub-1", amount_brl: 39.9, debit_date: "2026-05-01T00:00:00Z", refunded_at: null },
    ]);
    expect(picked.get("sub-1")).toMatchObject({ amount_brl: 39.9, debit_date: "2026-05-01T00:00:00Z" });
  });

  it("returns an empty map for no invoices", () => {
    expect(pickLastChargePerSubscription([]).size).toBe(0);
  });

  it("falls back to 0/null when the picked invoice has no amount or debit_date", () => {
    const picked = pickLastChargePerSubscription([
      { subscription_id: "sub-1", amount_brl: null, debit_date: null, refunded_at: null },
    ]);
    expect(picked.get("sub-1")).toEqual({ amount_brl: 0, debit_date: null, refunded_at: null });
  });
});

describe("mergeUserRows with invoices", () => {
  const sub: SubscriptionLite = {
    id: "sub-1", user_id: "u1", status: "authorized", created_at: "2026-02-01T00:00:00Z",
    trial_ends_at: "2026-06-10T00:00:00Z", first_payment_confirmed: false,
    plans: { name: "Profissional", price_brl: 59.9 },
  };

  it("attaches the last charge to the subscription when an approved invoice exists", () => {
    const invoices: InvoiceLite[] = [
      { subscription_id: "sub-1", amount_brl: 39.9, debit_date: "2026-06-05T00:00:00Z", refunded_at: null },
    ];
    const users = mergeUserRows([{ id: "u1" }], [], [], NOW, [sub], invoices);
    expect(users[0].subscription?.last_charge).toEqual({
      amount_brl: 39.9, debit_date: "2026-06-05T00:00:00Z", refunded_at: null,
    });
  });

  it("leaves last_charge null when there is no matching invoice", () => {
    const users = mergeUserRows([{ id: "u1" }], [], [], NOW, [sub], []);
    expect(users[0].subscription?.last_charge).toBeNull();
    // Also null when invoices are omitted entirely (default param).
    expect(mergeUserRows([{ id: "u1" }], [], [], NOW, [sub])[0].subscription?.last_charge).toBeNull();
  });
});
