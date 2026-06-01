import { describe, it, expect, vi } from "vitest";
import { authorizeSuperAdmin, type AdminAuthClient } from "./adminAuth";

function buildClient(opts: {
  user?: { id: string } | null;
  userError?: unknown;
  profile?: { is_super_admin: boolean | null } | null;
  profileError?: unknown;
}): { client: AdminAuthClient; getUser: ReturnType<typeof vi.fn>; maybeSingle: ReturnType<typeof vi.fn> } {
  const getUser = vi.fn().mockResolvedValue({
    data: { user: opts.user === undefined ? { id: "admin-1" } : opts.user },
    error: opts.userError ?? null,
  });
  const maybeSingle = vi.fn().mockResolvedValue({
    data: opts.profile === undefined ? { is_super_admin: true } : opts.profile,
    error: opts.profileError ?? null,
  });
  const client: AdminAuthClient = {
    auth: { getUser },
    from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }),
  };
  return { client, getUser, maybeSingle };
}

describe("authorizeSuperAdmin", () => {
  it("rejects when the Authorization header is missing", async () => {
    const { client } = buildClient({});
    const res = await authorizeSuperAdmin(client, null);
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("rejects when the bearer token is blank", async () => {
    const { client } = buildClient({});
    const res = await authorizeSuperAdmin(client, "Bearer    ");
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("rejects when getUser returns an error", async () => {
    const { client } = buildClient({ userError: { message: "bad jwt" } });
    const res = await authorizeSuperAdmin(client, "Bearer tok");
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("rejects when getUser returns no user", async () => {
    const { client } = buildClient({ user: null });
    const res = await authorizeSuperAdmin(client, "Bearer tok");
    expect(res).toEqual({ ok: false, status: 401, error: "unauthorized" });
  });

  it("returns internal_error when the profile lookup fails", async () => {
    const { client } = buildClient({ profileError: { message: "db down" } });
    const res = await authorizeSuperAdmin(client, "Bearer tok");
    expect(res).toEqual({ ok: false, status: 500, error: "internal_error" });
  });

  it("forbids a user whose profile is missing", async () => {
    const { client } = buildClient({ profile: null });
    const res = await authorizeSuperAdmin(client, "Bearer tok");
    expect(res).toEqual({ ok: false, status: 403, error: "forbidden" });
  });

  it("forbids a non super-admin user", async () => {
    const { client } = buildClient({ profile: { is_super_admin: false } });
    const res = await authorizeSuperAdmin(client, "Bearer tok");
    expect(res).toEqual({ ok: false, status: 403, error: "forbidden" });
  });

  it("authorizes a super-admin and strips the Bearer prefix", async () => {
    const { client, getUser } = buildClient({ user: { id: "admin-9" }, profile: { is_super_admin: true } });
    const res = await authorizeSuperAdmin(client, "Bearer my-token");
    expect(res).toEqual({ ok: true, userId: "admin-9" });
    expect(getUser).toHaveBeenCalledWith("my-token");
  });
});
