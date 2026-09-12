// First-access password for accounts born from a payment (random password,
// must_set_password = true). Pure validation + injected deps.

export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 72;

export type PasswordParse =
  | { ok: true; password: string }
  | { ok: false; error: "invalid_body" | "password_too_short" | "password_too_long" };

export function parsePasswordInput(body: unknown): PasswordParse {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { password } = body as Record<string, unknown>;
  if (typeof password !== "string") return { ok: false, error: "invalid_body" };
  if (password.length < PASSWORD_MIN) return { ok: false, error: "password_too_short" };
  if (password.length > PASSWORD_MAX) return { ok: false, error: "password_too_long" };
  return { ok: true, password };
}

export interface SetPasswordDeps {
  updatePassword(userId: string, password: string): Promise<void>;
  clearFlag(userId: string): Promise<void>;
  /** Revokes every other session of the user (auth.admin.signOut(jwt, 'others')). */
  revokeOtherSessions(): Promise<void>;
  log(message: string, ...args: unknown[]): void;
}

// Order matters: the password changes first (the thing the user asked for),
// then the flag, then the other sessions. A failure to revoke is logged, not
// fatal: the user already holds the session that made the request.
export async function runSetInitialPassword(userId: string, password: string, deps: SetPasswordDeps): Promise<void> {
  await deps.updatePassword(userId, password);
  await deps.clearFlag(userId);
  try {
    await deps.revokeOtherSessions();
  } catch (e) {
    deps.log("set-initial-password: could not revoke other sessions", userId, e);
  }
}
