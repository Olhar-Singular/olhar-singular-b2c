import { describe, it, expect, vi } from "vitest";
import { logAdminAction, sanitizeAuditPayload } from "./adminAudit";

describe("sanitizeAuditPayload", () => {
  it("keeps ids, actions and numbers", () => {
    expect(sanitizeAuditPayload({ amount: 30, mode: "trial", subscriptionId: "s1" })).toEqual({ amount: 30, mode: "trial", subscriptionId: "s1" });
  });

  it("drops keys that smell like PII and values that are e-mails", () => {
    expect(
      sanitizeAuditPayload({ email: "a@b.c", newEmail: "x@y.z", cpf: "123", password: "p", cardToken: "t", contact: "ana@x.com", note: "ok", missing: undefined }),
    ).toEqual({ note: "ok" });
  });

  it("returns an empty object for nothing", () => {
    expect(sanitizeAuditPayload(undefined)).toEqual({});
    expect(sanitizeAuditPayload(null)).toEqual({});
  });
});

describe("logAdminAction", () => {
  it("calls the RPC with the sanitized payload", async () => {
    const rpc = vi.fn(async () => ({ data: "id", error: null }));
    await logAdminAction({ rpc }, { actorId: "adm", targetUserId: "u1", action: "grant_credits", payload: { amount: 5, email: "a@b.c" } });
    expect(rpc).toHaveBeenCalledWith("log_admin_action", {
      p_actor_id: "adm", p_target_id: "u1", p_action: "grant_credits", p_payload: { amount: 5 },
    });
  });

  it("never throws: RPC errors and exceptions are logged", async () => {
    const log = vi.fn();
    await logAdminAction({ rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })) }, { actorId: "a", targetUserId: null, action: "x" }, log);
    expect(log).toHaveBeenCalledWith("admin audit failed:", "x", "boom");

    await logAdminAction({ rpc: vi.fn(async () => { throw new Error("down"); }) }, { actorId: "a", targetUserId: null, action: "y" }, log);
    expect(log).toHaveBeenCalledWith("admin audit failed:", "y", expect.any(Error));
  });

  it("defaults to console.error", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    await logAdminAction({ rpc: vi.fn(async () => ({ data: null, error: { message: "boom" } })) }, { actorId: "a", targetUserId: null, action: "z" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
