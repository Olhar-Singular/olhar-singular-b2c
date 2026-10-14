// Transactional e-mail through the Resend HTTPS API (no SDK: one POST with a
// bearer key). Dependencies are injected and the sender NEVER throws: the caller
// is a background task behind a checkout, so a dead e-mail provider must not be
// able to fail or delay a payment. Logs carry the subject, the HTTP status and
// the message id only: never the addressee, never the body.

export const RESEND_EMAILS_URL = "https://api.resend.com/emails";
export const EMAIL_TIMEOUT_MS = 5000;
export const DEFAULT_EMAIL_FROM = "Olhar Singular <contato@olharsingular.com>";

export interface EmailConfig {
  apiKey: string;
  /** "Name <address>" as Resend expects it. */
  from: string;
}

/** `null` without RESEND_API_KEY: the caller then skips the send (not_configured). */
export function readEmailConfig(env: { get(name: string): string | undefined }): EmailConfig | null {
  const apiKey = env.get("RESEND_API_KEY")?.trim();
  if (!apiKey) return null;
  const from = env.get("EMAIL_FROM")?.trim();
  return { apiKey, from: from || DEFAULT_EMAIL_FROM };
}

export interface EmailMessage {
  to: string;
  subject: string;
  html: string;
  text: string;
  /** Resend tags (ASCII letters, digits, "_" and "-"), for filtering in its dashboard. */
  tags?: { name: string; value: string }[];
}

export interface EmailDeps {
  fetch: typeof fetch;
  config: EmailConfig | null;
  /** Warnings: refused, failed or skipped sends. */
  log: (message: string, ...args: unknown[]) => void;
  /** Info: the one line of a successful send (defaults to console.log). */
  info?: (message: string, ...args: unknown[]) => void;
}

export type SendEmailResult =
  | { ok: true; id: string }
  | { ok: false; reason: "not_configured" | "timeout" | "network_error" | `http_${number}` };

/** POST /emails. Resolves in at most EMAIL_TIMEOUT_MS; never rejects. */
export async function sendEmail(deps: EmailDeps, message: EmailMessage): Promise<SendEmailResult> {
  if (!deps.config) {
    deps.log("email: not configured (RESEND_API_KEY), skipping", message.subject);
    return { ok: false, reason: "not_configured" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), EMAIL_TIMEOUT_MS);
  try {
    const resp = await deps.fetch(RESEND_EMAILS_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${deps.config.apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from: deps.config.from,
        to: [message.to],
        subject: message.subject,
        html: message.html,
        text: message.text,
        ...(message.tags ? { tags: message.tags } : {}),
      }),
      signal: controller.signal,
    });
    if (!resp.ok) {
      deps.log("email: endpoint answered", message.subject, resp.status);
      return { ok: false, reason: `http_${resp.status}` };
    }
    // A 2xx with a body that is not JSON is still a sent e-mail (no id to report).
    const data = (await resp.json().catch(() => ({}))) as { id?: string };
    const id = data.id ?? "";
    (deps.info ?? console.log)("email: sent", message.subject, resp.status, id);
    return { ok: true, id };
  } catch (e) {
    const reason = controller.signal.aborted ? "timeout" : "network_error";
    deps.log("email: send failed", message.subject, reason, e instanceof Error ? e.message : String(e));
    return { ok: false, reason };
  } finally {
    clearTimeout(timer);
  }
}
