import { describe, it, expect, vi } from "vitest";
import { runResendInvite, type InviteUser, type ResendInviteDeps } from "./adminResendInvite";

const ID = "0f6a2c2e-6d7b-4d0e-9a4b-1c2d3e4f5a6b";

const PENDING: InviteUser = { id: ID, email: "ana@x.com", invited_at: "2026-10-09T00:00:00Z", email_confirmed_at: null };

function deps(overrides: Partial<ResendInviteDeps> = {}): ResendInviteDeps {
  return {
    getUser: vi.fn().mockResolvedValue({ user: PENDING, error: null }),
    invite: vi.fn().mockResolvedValue({ error: null }),
    audit: vi.fn().mockResolvedValue(undefined),
    log: vi.fn(),
    ...overrides,
  };
}

describe("runResendInvite", () => {
  it("sends the invite again to a pending account and audits it", async () => {
    const d = deps();
    expect(await runResendInvite({ userId: ID.toUpperCase() }, d)).toEqual({ ok: true });
    expect(d.getUser).toHaveBeenCalledWith(ID);
    expect(d.invite).toHaveBeenCalledWith("ana@x.com");
    expect(d.audit).toHaveBeenCalledWith(ID);
  });

  it("refuses a body without a valid user id", async () => {
    const d = deps();
    expect(await runResendInvite(null, d)).toEqual({ ok: false, error: "invalid_body", status: 400 });
    expect(await runResendInvite({ userId: "x" }, d)).toEqual({ ok: false, error: "invalid_body", status: 400 });
    expect(await runResendInvite({ userId: 42 }, d)).toEqual({ ok: false, error: "invalid_body", status: 400 });
    expect(d.getUser).not.toHaveBeenCalled();
  });

  it("answers 404 when the account does not exist", async () => {
    const missing = deps({ getUser: vi.fn().mockResolvedValue({ user: null, error: { status: 404, message: "User not found" } }) });
    expect(await runResendInvite({ userId: ID }, missing)).toEqual({ ok: false, error: "user_not_found", status: 404 });
    const empty = deps({ getUser: vi.fn().mockResolvedValue({ user: null, error: null }) });
    expect(await runResendInvite({ userId: ID }, empty)).toEqual({ ok: false, error: "user_not_found", status: 404 });
  });

  it("logs and answers 500 when looking the account up fails", async () => {
    const d = deps({ getUser: vi.fn().mockResolvedValue({ user: null, error: { status: 500, message: "boom" } }) });
    expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "internal_error", status: 500 });
    expect(d.log).toHaveBeenCalled();
  });

  it("refuses an account that was never invited (checkout or legacy signup)", async () => {
    const d = deps({ getUser: vi.fn().mockResolvedValue({ user: { ...PENDING, invited_at: null }, error: null }) });
    expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "not_invited", status: 409 });
    expect(d.invite).not.toHaveBeenCalled();
  });

  it("refuses an invited account without an e-mail", async () => {
    const d = deps({ getUser: vi.fn().mockResolvedValue({ user: { ...PENDING, email: null }, error: null }) });
    expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "not_invited", status: 409 });
  });

  it("refuses an invite that was already accepted", async () => {
    const d = deps({ getUser: vi.fn().mockResolvedValue({ user: { ...PENDING, email_confirmed_at: "2026-10-09T01:00:00Z" }, error: null }) });
    expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "invite_already_accepted", status: 409 });
    expect(d.invite).not.toHaveBeenCalled();
  });

  it("treats an e-mail-exists answer as accepted in the meantime", async () => {
    for (const error of [
      { status: 422, code: "email_exists", message: "A user with this email address has already been registered" },
      { status: 400, message: "User already registered" },
    ]) {
      const d = deps({ invite: vi.fn().mockResolvedValue({ error }) });
      expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "invite_already_accepted", status: 409 });
      expect(d.audit).not.toHaveBeenCalled();
    }
  });

  it("does not read another coded 422 as an accepted invite", async () => {
    const d = deps({ invite: vi.fn().mockResolvedValue({ error: { status: 422, code: "validation_failed", message: "Unable to validate email address" } }) });
    expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "internal_error", status: 500 });
    expect(d.log).toHaveBeenCalled();
  });

  it("surfaces the e-mail rate limit so the admin knows to wait", async () => {
    const d = deps({ invite: vi.fn().mockResolvedValue({ error: { status: 429, code: "over_email_send_rate_limit", message: "email rate limit exceeded" } }) });
    expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "rate_limited", status: 429 });
    expect(d.audit).not.toHaveBeenCalled();
  });

  it("logs and answers 500 on any other invite failure", async () => {
    const d = deps({ invite: vi.fn().mockResolvedValue({ error: { status: 500, message: "smtp down" } }) });
    expect(await runResendInvite({ userId: ID }, d)).toEqual({ ok: false, error: "internal_error", status: 500 });
    expect(d.log).toHaveBeenCalled();
    expect(d.audit).not.toHaveBeenCalled();
  });

  it("logs through console.error when no logger is injected", async () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const d = deps({ invite: vi.fn().mockResolvedValue({ error: { message: "smtp down" } }) });
    delete d.log;
    expect(await runResendInvite({ userId: ID }, d)).toMatchObject({ error: "internal_error" });
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
