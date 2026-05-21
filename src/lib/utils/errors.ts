const NETWORK_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
];

const SUPABASE_GENERIC_INVOKE_MSG = "edge function returned a non-2xx status code";

export const MSG_NETWORK = "Sem conexão com o servidor. Verifique sua internet.";

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  const lower = (err.message ?? "").toLowerCase();
  return NETWORK_PATTERNS.some((p) => lower.includes(p));
}

/**
 * For Supabase DB calls: never exposes raw Postgres/library errors.
 * Network errors → connection message. PGRST205 / schema cache → reload hint.
 * Everything else → fallback.
 */
export function parseDbError(err: unknown, fallback: string): string {
  if (isNetworkError(err)) return MSG_NETWORK;
  if (err instanceof Error) {
    const code = (err as Record<string, unknown>).code;
    const lower = err.message.toLowerCase();
    if (code === "PGRST205" || lower.includes("schema cache")) {
      return "Serviço temporariamente indisponível. Recarregue a página.";
    }
  }
  return fallback;
}

/**
 * For edge-function fetch/invoke calls: backend messages are already in Portuguese.
 * Network errors → connection message. AbortError → "" (caller should skip).
 * The Supabase SDK generic message is suppressed → fallback shown instead.
 * Everything else → err.message (our backend error).
 */
export function parseEdgeFnError(err: unknown, fallback: string): string {
  if (isNetworkError(err)) return MSG_NETWORK;
  if (err instanceof Error && err.name === "AbortError") return "";
  if (err instanceof Error && (err.message ?? "").toLowerCase() === SUPABASE_GENERIC_INVOKE_MSG) return fallback;
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/**
 * For supabase.functions.invoke() errors: reads the real JSON body from the response
 * before falling back to parseEdgeFnError. Always returns a user-safe string.
 */
export async function parseInvokeError(err: unknown, fallback: string): Promise<string> {
  if (err instanceof Error && err.message.toLowerCase() !== SUPABASE_GENERIC_INVOKE_MSG) {
    return parseEdgeFnError(err, fallback);
  }
  const context = (err as Record<string, unknown>)?.context as { json?: () => Promise<unknown> } | undefined;
  if (context?.json) {
    try {
      const body = await context.json();
      const errorMsg = (body as Record<string, unknown>)?.error;
      if (typeof errorMsg === "string" && errorMsg) return errorMsg;
    } catch {
      // body already consumed or not JSON — fall through
    }
  }
  return fallback;
}

/** Maps Supabase Auth error messages to Portuguese user-facing strings. */
export function parseAuthError(message: string | undefined, action: "login" | "signup" = "login"): string {
  if (!message) return action === "signup" ? "Erro ao criar conta. Tente novamente." : "Erro ao entrar. Tente novamente.";
  const m = message.toLowerCase();
  if (m.includes("failed to fetch") || m.includes("networkerror") || m.includes("network")) {
    return MSG_NETWORK;
  }
  if (m.includes("invalid login") || m.includes("invalid credentials")) {
    return "E-mail ou senha incorretos.";
  }
  if (m.includes("already registered")) {
    return "Este e-mail já está cadastrado. Tente entrar.";
  }
  if (m.includes("email not confirmed")) {
    return "Confirme seu e-mail antes de entrar.";
  }
  if (m.includes("too many requests") || m.includes("rate limit")) {
    return "Muitas tentativas. Aguarde alguns minutos.";
  }
  if (m.includes("weak password") || m.includes("password")) {
    return "Senha muito fraca. Use pelo menos 6 caracteres.";
  }
  return "Erro ao acessar a conta. Tente novamente.";
}
