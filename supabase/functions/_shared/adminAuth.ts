// Shared authorization helper for the admin-* edge functions.
// Validates the caller's JWT and confirms they are a super-admin (profiles.is_super_admin).
// Parameterized over a minimal client interface so it is unit-testable without Deno.

export interface AuthClientUser {
  id: string;
}

export interface AdminAuthClient {
  auth: {
    getUser(token: string): PromiseLike<{ data: { user: AuthClientUser | null } | null; error: unknown }>;
  };
  // Structural typing of the PostgREST builder chain made `deno check` hit
  // "type instantiation is excessively deep" against supabase-js's generics;
  // the profile read below is the only use, so the chain is left untyped.
  // deno-lint-ignore no-explicit-any
  from(table: string): any;
}

export type AuthorizeResult =
  | { ok: true; userId: string }
  | { ok: false; status: number; error: string };

export async function authorizeSuperAdmin(
  client: AdminAuthClient,
  authHeader: string | null,
): Promise<AuthorizeResult> {
  if (!authHeader) return { ok: false, status: 401, error: "unauthorized" };

  const token = authHeader.replace(/^Bearer\s+/i, "").trim();
  if (!token) return { ok: false, status: 401, error: "unauthorized" };

  const { data, error } = await client.auth.getUser(token);
  if (error || !data?.user) return { ok: false, status: 401, error: "unauthorized" };

  const { data: profile, error: profileError } = await client
    .from("profiles")
    .select("is_super_admin")
    .eq("id", data.user.id)
    .maybeSingle();

  if (profileError) return { ok: false, status: 500, error: "internal_error" };
  if (!profile?.is_super_admin) return { ok: false, status: 403, error: "forbidden" };

  return { ok: true, userId: data.user.id };
}
