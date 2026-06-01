import { describe, it, expect } from "vitest";
import { validateStatusInput, banDurationFor } from "./adminUserStatus";

describe("validateStatusInput", () => {
  it("rejects a non-object body", () => {
    expect(validateStatusInput(null, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateStatusInput("nope", "admin")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a missing or non-string userId", () => {
    expect(validateStatusInput({ action: "ban" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateStatusInput({ userId: 123, action: "ban" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateStatusInput({ userId: "", action: "ban" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects an invalid action", () => {
    expect(validateStatusInput({ userId: "u1", action: "delete" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
    expect(validateStatusInput({ userId: "u1" }, "admin")).toEqual({ ok: false, error: "invalid_body" });
  });

  it("forbids an admin from banning themselves", () => {
    expect(validateStatusInput({ userId: "admin", action: "ban" }, "admin")).toEqual({
      ok: false,
      error: "cannot_ban_self",
    });
  });

  it("allows an admin to unban themselves (no-op safety)", () => {
    expect(validateStatusInput({ userId: "admin", action: "unban" }, "admin")).toEqual({
      ok: true,
      input: { userId: "admin", action: "unban" },
    });
  });

  it("accepts a valid ban of another user", () => {
    expect(validateStatusInput({ userId: "u1", action: "ban" }, "admin")).toEqual({
      ok: true,
      input: { userId: "u1", action: "ban" },
    });
  });
});

describe("banDurationFor", () => {
  it("returns a long duration for ban", () => {
    expect(banDurationFor("ban")).toBe("876000h");
  });

  it("returns 'none' for unban", () => {
    expect(banDurationFor("unban")).toBe("none");
  });
});
