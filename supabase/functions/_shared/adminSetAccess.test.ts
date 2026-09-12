import { describe, it, expect } from "vitest";
import { validateSetAccessInput } from "./adminSetAccess";

describe("validateSetAccessInput", () => {
  it("rejects a non-object body", () => {
    expect(validateSetAccessInput(null, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateSetAccessInput("x", "admin")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a missing or non-string userId", () => {
    expect(validateSetAccessInput({ kind: "trial" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateSetAccessInput({ userId: 7, kind: "trial" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateSetAccessInput({ userId: "", kind: "trial" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("accepts a kind change to trial, exempt or legacy", () => {
    expect(validateSetAccessInput({ userId: "u1", kind: "trial" }, "admin")).toEqual({
      ok: true,
      input: { userId: "u1", action: "set_kind", kind: "trial" },
    });
    expect(validateSetAccessInput({ userId: "u1", kind: "exempt" }, "admin")).toEqual({
      ok: true,
      input: { userId: "u1", action: "set_kind", kind: "exempt" },
    });
    expect(validateSetAccessInput({ userId: "u1", kind: "legacy" }, "admin")).toEqual({
      ok: true,
      input: { userId: "u1", action: "set_kind", kind: "legacy" },
    });
  });

  // 'subscriber' is produced by the subscription flow only.
  it("refuses subscriber and unknown kinds", () => {
    expect(validateSetAccessInput({ userId: "u1", kind: "subscriber" }, "admin")).toEqual({ ok: false, error: "invalid_kind" });
    expect(validateSetAccessInput({ userId: "u1", kind: "vip" }, "admin")).toEqual({ ok: false, error: "invalid_kind" });
  });

  it("accepts the trial extension presets only", () => {
    expect(validateSetAccessInput({ userId: "u1", extendDays: 7 }, "admin")).toEqual({
      ok: true,
      input: { userId: "u1", action: "extend_trial", days: 7 },
    });
    expect(validateSetAccessInput({ userId: "u1", extendDays: 14 }, "admin").ok).toBe(true);
    expect(validateSetAccessInput({ userId: "u1", extendDays: 30 }, "admin").ok).toBe(true);
    expect(validateSetAccessInput({ userId: "u1", extendDays: 3 }, "admin")).toEqual({ ok: false, error: "invalid_days" });
    expect(validateSetAccessInput({ userId: "u1", extendDays: "7" }, "admin")).toEqual({ ok: false, error: "invalid_days" });
  });

  it("requires exactly one of kind or extendDays", () => {
    expect(validateSetAccessInput({ userId: "u1" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateSetAccessInput({ userId: "u1", kind: "trial", extendDays: 7 }, "admin")).toEqual({
      ok: false,
      error: "invalid_body",
    });
  });

  // An admin downgrading their own account would lock themselves out of the tests they run.
  it("forbids an admin from changing their own access", () => {
    expect(validateSetAccessInput({ userId: "admin", kind: "legacy" }, "admin")).toEqual({
      ok: false,
      error: "cannot_change_self",
    });
  });
});
