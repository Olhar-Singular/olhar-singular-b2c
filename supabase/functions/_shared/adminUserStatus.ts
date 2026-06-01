// Input validation for the admin-user-status edge function (ban / unban).

export type StatusAction = "ban" | "unban";

export interface StatusInput {
  userId: string;
  action: StatusAction;
}

export type ValidateResult =
  | { ok: true; input: StatusInput }
  | { ok: false; error: string };

/** Validates the request body and prevents an admin from banning themselves. */
export function validateStatusInput(body: unknown, callerId: string): ValidateResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };

  const { userId, action } = body as { userId?: unknown; action?: unknown };
  if (typeof userId !== "string" || !userId) return { ok: false, error: "invalid_body" };
  if (action !== "ban" && action !== "unban") return { ok: false, error: "invalid_body" };
  if (action === "ban" && userId === callerId) return { ok: false, error: "cannot_ban_self" };

  return { ok: true, input: { userId, action } };
}

// ~100 years — effectively a permanent ban via Supabase Auth ban_duration.
const PERMANENT_BAN = "876000h";

/** Maps an action to the Supabase Auth `ban_duration` value. */
export function banDurationFor(action: StatusAction): string {
  return action === "ban" ? PERMANENT_BAN : "none";
}
