import { describe, it, expect } from "vitest";
import {
  isUserActive,
  shapeSeries,
  mergeUserRows,
  type AuthUserLite,
  type ProfileLite,
  type SpendingLite,
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
    { id: "u1", full_name: "Alice", credit_balance: 42, is_super_admin: true },
    { id: "u2", full_name: "Bob", credit_balance: 0, is_super_admin: false },
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
      total_usd: 0.0123,
      last_sign_in_at: "2026-05-30T00:00:00Z",
      created_at: "2026-01-01T00:00:00Z",
      is_active: true,
      is_super_admin: true,
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
      total_usd: 0,
      last_sign_in_at: null,
      created_at: null,
      is_active: true,
      is_super_admin: false,
    });
  });

  it("returns an empty array when there are no users", () => {
    expect(mergeUserRows([], profiles, spending, NOW)).toEqual([]);
  });
});
