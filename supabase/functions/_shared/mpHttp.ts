// One place for every call to the Mercado Pago API: base URL, bearer token,
// JSON body, and a timeout. Without the timeout a hung MP endpoint held the
// checkout open until the platform killed the isolate, with no feedback.

export const MP_BASE_URL = "https://api.mercadopago.com";
export const MP_TIMEOUT_MS = 15_000;

export interface MpResponse {
  ok: boolean;
  status: number;
  json: Record<string, unknown>;
}

export class MpTimeoutError extends Error {
  constructor(path: string) {
    super(`Mercado Pago timed out: ${path}`);
    this.name = "MpTimeoutError";
  }
}

export async function mpRequest(
  path: string,
  init: { method?: string; token: string; body?: unknown; idempotencyKey?: string; timeoutMs?: number },
  fetchFn: typeof fetch = fetch,
): Promise<MpResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), init.timeoutMs ?? MP_TIMEOUT_MS);
  const headers: Record<string, string> = { Authorization: `Bearer ${init.token}` };
  if (init.body !== undefined) headers["Content-Type"] = "application/json";
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
  try {
    const resp = await fetchFn(`${MP_BASE_URL}${path}`, {
      method: init.method ?? "GET",
      headers,
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: controller.signal,
    });
    const json = (await resp.json().catch(() => ({}))) as Record<string, unknown>;
    return { ok: resp.ok, status: resp.status, json };
  } catch (e) {
    if (controller.signal.aborted) throw new MpTimeoutError(path);
    throw e;
  } finally {
    clearTimeout(timer);
  }
}

/** Best-effort cancel of a preapproval; never throws, reports success. */
export async function cancelPreapprovalAtMp(preapprovalId: string, token: string, fetchFn: typeof fetch = fetch): Promise<boolean> {
  try {
    const resp = await mpRequest(`/preapproval/${encodeURIComponent(preapprovalId)}`, { method: "PUT", token, body: { status: "cancelled" } }, fetchFn);
    return resp.ok;
  } catch {
    return false;
  }
}
