// Input validation for the admin-grant-credits edge function.

export interface GrantInput {
  userId: string;
  amount: number;
}

export type ValidateGrantResult =
  | { ok: true; input: GrantInput }
  | { ok: false; error: string };

// Upper bound to guard against fat-finger grants.
export const MAX_GRANT = 100000;

export function validateGrantInput(body: unknown): ValidateGrantResult {
  if (typeof body !== "object" || body === null) return { ok: false, error: "invalid_body" };

  const { userId, amount } = body as { userId?: unknown; amount?: unknown };
  if (typeof userId !== "string" || !userId) return { ok: false, error: "invalid_body" };
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > MAX_GRANT) {
    return { ok: false, error: "invalid_amount" };
  }

  return { ok: true, input: { userId, amount } };
}
