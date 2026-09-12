import { describe, it, expect, vi } from "vitest";
import { parsePasswordInput, runSetInitialPassword, type SetPasswordDeps } from "./setInitialPassword";

describe("parsePasswordInput", () => {
  it("accepts 6 to 72 characters", () => {
    expect(parsePasswordInput({ password: "abcdef" })).toEqual({ ok: true, password: "abcdef" });
    expect(parsePasswordInput({ password: "a".repeat(72) })).toMatchObject({ ok: true });
  });

  it("rejects missing, short and long passwords", () => {
    expect(parsePasswordInput(null)).toEqual({ ok: false, error: "invalid_body" });
    expect(parsePasswordInput({})).toEqual({ ok: false, error: "invalid_body" });
    expect(parsePasswordInput({ password: 123 })).toEqual({ ok: false, error: "invalid_body" });
    expect(parsePasswordInput({ password: "abc" })).toEqual({ ok: false, error: "password_too_short" });
    expect(parsePasswordInput({ password: "a".repeat(73) })).toEqual({ ok: false, error: "password_too_long" });
  });
});

describe("runSetInitialPassword", () => {
  function deps(overrides: Partial<SetPasswordDeps> = {}) {
    const d = {
      updatePassword: vi.fn(async () => undefined),
      clearFlag: vi.fn(async () => undefined),
      revokeOtherSessions: vi.fn(async () => undefined),
      log: vi.fn(),
      ...overrides,
    };
    return d as SetPasswordDeps & typeof d;
  }

  it("updates the password, clears the flag and revokes the other sessions, in that order", async () => {
    const order: string[] = [];
    const d = deps({
      updatePassword: vi.fn(async () => { order.push("password"); }),
      clearFlag: vi.fn(async () => { order.push("flag"); }),
      revokeOtherSessions: vi.fn(async () => { order.push("revoke"); }),
    });
    await runSetInitialPassword("u1", "secret1", d);
    expect(d.updatePassword).toHaveBeenCalledWith("u1", "secret1");
    expect(d.clearFlag).toHaveBeenCalledWith("u1");
    expect(order).toEqual(["password", "flag", "revoke"]);
  });

  it("propagates a password update failure without touching the flag", async () => {
    const d = deps({ updatePassword: vi.fn(async () => { throw new Error("weak"); }) });
    await expect(runSetInitialPassword("u1", "secret1", d)).rejects.toThrow("weak");
    expect(d.clearFlag).not.toHaveBeenCalled();
  });

  it("logs but does not fail when the other sessions cannot be revoked", async () => {
    const d = deps({ revokeOtherSessions: vi.fn(async () => { throw new Error("gotrue down"); }) });
    await expect(runSetInitialPassword("u1", "secret1", d)).resolves.toBeUndefined();
    expect(d.log).toHaveBeenCalledWith(expect.stringMatching(/revoke/), "u1", expect.any(Error));
  });
});
