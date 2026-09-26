// =============================================================================
// User-safe error responses for edge functions.
//
// The outer catch of the functions used to answer `{ error: e.message }`, and
// the client toasts `body.error` verbatim: raw Postgres / GoTrue / Mercado Pago
// text (table, RPC and constraint names) reached the browser, even on the
// anonymous checkout. Now only a PublicError carries its message out; anything
// else is logged here in full and answered with a generic pt-BR message.
//
// Usage in an index.ts:
//   } catch (e) {
//     return errorResponse(e, { label: "subscribe error:", headers: corsHeaders });
//   }
// and, where a message is MEANT for the user, `throw new PublicError("...", {
// status, code })` instead of `throw new Error(...)`.
// =============================================================================

/** Generic answer for any non-public failure (same text the admin panel shows for internal_error). */
export const INTERNAL_ERROR_MESSAGE = "Erro interno. Tente de novo em instantes.";
/** Machine code sent with the generic answer. */
export const INTERNAL_ERROR_CODE = "internal_error";

/**
 * An error whose message is written for the end user (pt-BR, no internals) and
 * may therefore be sent to the client as is. The status defaults to 500, the
 * status an outer catch has always answered with.
 */
export class PublicError extends Error {
  readonly status: number;
  /** Machine-readable code for the client (`{ code }` in the body), if any. */
  readonly code: string | null;

  constructor(message: string, options: { status?: number; code?: string; cause?: unknown } = {}) {
    super(message, { cause: options.cause });
    this.name = "PublicError";
    this.status = options.status ?? 500;
    this.code = options.code ?? null;
  }
}

export interface ErrorResponseOptions {
  /** Log prefix naming the function (and stage), e.g. "subscribe error:". */
  label: string;
  /** The function's CORS headers; Content-Type is added here. */
  headers: Record<string, string>;
  /** The function's own generic message, when it has one (default INTERNAL_ERROR_MESSAGE). */
  fallbackMessage?: string;
}

/**
 * Turn anything a function caught into its error Response: a PublicError keeps
 * its message, status and code; every other value is logged server-side and
 * answered with a generic 500, so no internal detail ever reaches the client.
 */
export function errorResponse(error: unknown, options: ErrorResponseOptions): Response {
  if (error instanceof PublicError) {
    console.warn(options.label, error);
    return json(
      error.code ? { error: error.message, code: error.code } : { error: error.message },
      error.status,
      options.headers,
    );
  }
  console.error(options.label, error);
  return json(
    { error: options.fallbackMessage ?? INTERNAL_ERROR_MESSAGE, code: INTERNAL_ERROR_CODE },
    500,
    options.headers,
  );
}

function json(body: Record<string, unknown>, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...headers, "Content-Type": "application/json" },
  });
}
