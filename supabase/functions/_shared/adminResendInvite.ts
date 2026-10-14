// Resend of an admin invite that was never accepted. The invite link expires
// (Auth's e-mail OTP expiry) and is single-use, so support needs a fresh one.
// Auth's invite endpoint re-sends to an unconfirmed user with a new token,
// which also kills the old link; a confirmed one answers email_exists.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export interface InviteUser {
  id: string;
  email?: string | null;
  invited_at?: string | null;
  email_confirmed_at?: string | null;
}

interface AuthError {
  status?: number;
  code?: string;
  message: string;
}

export interface ResendInviteDeps {
  getUser(userId: string): Promise<{ user: InviteUser | null; error: AuthError | null }>;
  invite(email: string): Promise<{ error: AuthError | null }>;
  audit(targetUserId: string): Promise<void>;
  log?: (message: string, ...args: unknown[]) => void;
}

export type ResendInviteError =
  | "invalid_body"
  | "user_not_found"
  | "not_invited"
  | "invite_already_accepted"
  | "rate_limited"
  | "internal_error";

export type ResendInviteResult = { ok: true } | { ok: false; error: ResendInviteError; status: number };

function fail(error: ResendInviteError, status: number): ResendInviteResult {
  return { ok: false, error, status };
}

export async function runResendInvite(body: unknown, deps: ResendInviteDeps): Promise<ResendInviteResult> {
  const log = deps.log ?? console.error;
  const userId = (body as { userId?: unknown } | null)?.userId;
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return fail("invalid_body", 400);
  const id = userId.toLowerCase();

  const { user, error: lookupError } = await deps.getUser(id);
  if (lookupError && lookupError.status !== 404) {
    log("admin-resend-invite lookup error:", lookupError.status, lookupError.message);
    return fail("internal_error", 500);
  }
  if (!user) return fail("user_not_found", 404);
  if (!user.invited_at || !user.email) return fail("not_invited", 409);
  if (user.email_confirmed_at) return fail("invite_already_accepted", 409);

  const { error } = await deps.invite(user.email);
  if (error) {
    // Accepted between the lookup and the resend. A coded answer is trusted as
    // is (a 422 validation_failed is not an acceptance); the status/message
    // fallback covers an older Auth that sends no code.
    const accepted = error.code
      ? error.code === "email_exists"
      : error.status === 422 || /already/i.test(error.message);
    if (accepted) {
      return fail("invite_already_accepted", 409);
    }
    if (error.status === 429) return fail("rate_limited", 429);
    log("admin-resend-invite invite error:", error.status, error.message);
    return fail("internal_error", 500);
  }

  await deps.audit(id);
  return { ok: true };
}
