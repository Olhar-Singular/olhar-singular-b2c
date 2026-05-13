const NETWORK_PATTERNS = [
  "failed to fetch",
  "networkerror",
  "network request failed",
  "load failed",
];

export const MSG_NETWORK = "Sem conexão com o servidor. Verifique sua internet.";

export function isNetworkError(err: unknown): boolean {
  if (err instanceof TypeError) return true;
  if (!(err instanceof Error)) return false;
  const lower = err.message.toLowerCase();
  return NETWORK_PATTERNS.some((p) => lower.includes(p));
}

/**
 * For Supabase DB calls: never exposes raw Postgres/library errors.
 * Network errors → connection message. Everything else → fallback.
 */
export function parseDbError(err: unknown, fallback: string): string {
  return isNetworkError(err) ? MSG_NETWORK : fallback;
}

/**
 * For edge-function fetch calls: backend messages are already in Portuguese.
 * Network errors → connection message. AbortError → "" (caller should skip).
 * Everything else → err.message (our backend error).
 */
export function parseEdgeFnError(err: unknown, fallback: string): string {
  if (isNetworkError(err)) return MSG_NETWORK;
  if (err instanceof Error && err.name === "AbortError") return "";
  if (err instanceof Error && err.message) return err.message;
  return fallback;
}

/** Maps Supabase Auth error messages to Portuguese user-facing strings. */
export function parseAuthError(message: string | undefined): string {
  if (!message) return "Erro inesperado. Tente novamente.";
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
