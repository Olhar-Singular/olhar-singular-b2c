// Input validation for the admin-set-access edge function: change a user's
// access kind (trial / exempt / legacy) or extend a running trial.

export type AccessKind = "trial" | "exempt" | "legacy";
export const TRIAL_EXTENSION_PRESETS = [7, 14, 30] as const;

export type SetAccessInput =
  | { userId: string; action: "set_kind"; kind: AccessKind }
  | { userId: string; action: "extend_trial"; days: number };

export type ValidateSetAccessResult =
  | { ok: true; input: SetAccessInput }
  | { ok: false; error: "invalid_body" | "invalid_kind" | "invalid_days" | "cannot_change_self" };

const KINDS: readonly AccessKind[] = ["trial", "exempt", "legacy"];

export function validateSetAccessInput(body: unknown, callerId: string): ValidateSetAccessResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };

  const { userId, kind, extendDays } = body as { userId?: unknown; kind?: unknown; extendDays?: unknown };
  if (typeof userId !== "string" || !userId) return { ok: false, error: "invalid_body" };

  const hasKind = kind !== undefined;
  const hasDays = extendDays !== undefined;
  if (hasKind === hasDays) return { ok: false, error: "invalid_body" };

  // An admin downgrading their own account would lock themselves out of the
  // smoke tests they run; the SQL editor is the escape hatch, not this endpoint.
  if (userId === callerId) return { ok: false, error: "cannot_change_self" };

  if (hasKind) {
    if (!KINDS.includes(kind as AccessKind)) return { ok: false, error: "invalid_kind" };
    return { ok: true, input: { userId, action: "set_kind", kind: kind as AccessKind } };
  }

  if (!TRIAL_EXTENSION_PRESETS.includes(extendDays as (typeof TRIAL_EXTENSION_PRESETS)[number])) {
    return { ok: false, error: "invalid_days" };
  }
  return { ok: true, input: { userId, action: "extend_trial", days: extendDays as number } };
}
