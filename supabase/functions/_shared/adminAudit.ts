// Audit trail of super-admin actions (admin_actions). The payload is sanitized
// so an e-mail, CPF or password never lands in the table, and logging never
// fails the action it describes: a broken audit is logged, not thrown.

const SENSITIVE_KEY = /(e-?mail|cpf|password|senha|token|card|cart[aã]o)/i;
const EMAIL_VALUE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function sanitizeAuditPayload(payload: Record<string, unknown> | undefined | null): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (!payload) return out;
  for (const [key, value] of Object.entries(payload)) {
    if (SENSITIVE_KEY.test(key)) continue;
    if (typeof value === "string" && EMAIL_VALUE.test(value)) continue;
    if (value === undefined) continue;
    out[key] = value;
  }
  return out;
}

export interface AdminAuditEntry {
  actorId: string;
  targetUserId: string | null;
  action: string;
  payload?: Record<string, unknown>;
}

export interface AuditClient {
  // Loosely typed on purpose: supabase-js's rpc generics make `deno check`
  // hit "type instantiation is excessively deep" through a structural type.
  // deno-lint-ignore no-explicit-any
  rpc(fn: string, args: Record<string, unknown>): PromiseLike<any>;
}

export async function logAdminAction(
  client: AuditClient,
  entry: AdminAuditEntry,
  log: (message: string, ...args: unknown[]) => void = console.error,
): Promise<void> {
  try {
    const { error } = await client.rpc("log_admin_action", {
      p_actor_id: entry.actorId,
      p_target_id: entry.targetUserId,
      p_action: entry.action,
      p_payload: sanitizeAuditPayload(entry.payload),
    });
    if (error) log("admin audit failed:", entry.action, error.message);
  } catch (e) {
    log("admin audit failed:", entry.action, e);
  }
}
