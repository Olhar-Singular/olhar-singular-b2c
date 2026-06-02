import { describe, it, expect } from "vitest";
import { validateGrantInput, MAX_GRANT } from "./adminGrantCredits";

describe("validateGrantInput", () => {
  it("rejects a non-object body", () => {
    expect(validateGrantInput(null)).toEqual({ ok: false, error: "invalid_body" });
    expect(validateGrantInput("nope")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a missing or non-string userId", () => {
    expect(validateGrantInput({ amount: 10 })).toEqual({ ok: false, error: "invalid_body" });
    expect(validateGrantInput({ userId: 123, amount: 10 })).toEqual({ ok: false, error: "invalid_body" });
    expect(validateGrantInput({ userId: "", amount: 10 })).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects non-integer, non-positive or oversized amounts", () => {
    expect(validateGrantInput({ userId: "u1", amount: 0 })).toEqual({ ok: false, error: "invalid_amount" });
    expect(validateGrantInput({ userId: "u1", amount: -5 })).toEqual({ ok: false, error: "invalid_amount" });
    expect(validateGrantInput({ userId: "u1", amount: 1.5 })).toEqual({ ok: false, error: "invalid_amount" });
    expect(validateGrantInput({ userId: "u1", amount: "10" })).toEqual({ ok: false, error: "invalid_amount" });
    expect(validateGrantInput({ userId: "u1", amount: MAX_GRANT + 1 })).toEqual({ ok: false, error: "invalid_amount" });
  });

  it("accepts a valid grant and the maximum", () => {
    expect(validateGrantInput({ userId: "u1", amount: 50 })).toEqual({ ok: true, input: { userId: "u1", amount: 50 } });
    expect(validateGrantInput({ userId: "u1", amount: MAX_GRANT })).toEqual({
      ok: true,
      input: { userId: "u1", amount: MAX_GRANT },
    });
  });
});
