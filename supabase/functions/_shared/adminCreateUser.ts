// Input validation for admin-create-user: an account born from an invite, in
// Trial (7 days, 50 credits on acceptance) or Cortesia (exempt) mode.

import { isValidEmail } from "./checkoutGuard.ts";

export type InviteMode = "trial" | "exempt";
const MODES: readonly InviteMode[] = ["trial", "exempt"];

export type CreateUserValidation =
  | { ok: true; input: { email: string; fullName: string; mode: InviteMode } }
  | { ok: false; error: "invalid_body" | "invalid_email" | "invalid_name" | "invalid_mode" };

export function validateCreateUserInput(body: unknown): CreateUserValidation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { email, fullName, mode } = body as Record<string, unknown>;
  if (typeof email !== "string" || !isValidEmail(email.trim())) return { ok: false, error: "invalid_email" };
  if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.length > 120) return { ok: false, error: "invalid_name" };
  if (!MODES.includes(mode as InviteMode)) return { ok: false, error: "invalid_mode" };
  return { ok: true, input: { email: email.trim().toLowerCase(), fullName: fullName.trim(), mode: mode as InviteMode } };
}

// The invite link lands on the reset-password page in "create" mode.
export function inviteRedirect(appUrl: string): string {
  return `${appUrl.replace(/\/+$/, "")}/redefinir-senha?convite=1`;
}

export type ChangeEmailValidation =
  | { ok: true; input: { userId: string; email: string } }
  | { ok: false; error: "invalid_body" | "invalid_email" | "cannot_change_self" };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function validateChangeEmailInput(body: unknown, callerId: string): ChangeEmailValidation {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };
  const { userId, email } = body as Record<string, unknown>;
  if (typeof userId !== "string" || !UUID_RE.test(userId)) return { ok: false, error: "invalid_body" };
  if (userId.toLowerCase() === callerId.toLowerCase()) return { ok: false, error: "cannot_change_self" };
  if (typeof email !== "string" || !isValidEmail(email.trim())) return { ok: false, error: "invalid_email" };
  return { ok: true, input: { userId: userId.toLowerCase(), email: email.trim().toLowerCase() } };
}
