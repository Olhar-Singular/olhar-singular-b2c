// Guard of the public subscribe endpoint: identifier normalization/hashing and
// the rate-limit / circuit-breaker decision, all pure so the thresholds are
// unit-tested. Raw e-mails and IPs never reach the database: only HMACs.

const GMAIL_DOMAINS = new Set(["gmail.com", "googlemail.com"]);

// Lower-case; in gmail, dots and +tags are ignored by the provider, so they are
// stripped here too (otherwise a.b+1@gmail.com is a new identity per attempt).
export function normalizeEmail(raw: string): string {
  const email = raw.trim().toLowerCase();
  const at = email.lastIndexOf("@");
  if (at <= 0) return email;
  let local = email.slice(0, at);
  const domain = email.slice(at + 1);
  if (GMAIL_DOMAINS.has(domain)) {
    local = local.split("+")[0].replace(/\./g, "");
  }
  return `${local}@${domain}`;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;

export function isValidEmail(value: string): boolean {
  return value.length <= 254 && EMAIL_RE.test(value);
}

// The LAST hop of x-forwarded-for: the gateway in front of the function
// appends the address it saw, while anything a direct caller puts in the
// header (a forged first hop) sits before it. cf-connecting-ip, when present,
// is set by the edge and wins.
export function clientIp(headers: { get(name: string): string | null }): string {
  const cf = headers.get("cf-connecting-ip");
  if (cf) return cf.trim();
  const forwarded = headers.get("x-forwarded-for");
  if (forwarded) {
    const hops = forwarded.split(",").map((h) => h.trim()).filter(Boolean);
    if (hops.length > 0) return hops[hops.length - 1];
  }
  return headers.get("x-real-ip") ?? "unknown";
}

// HMAC-SHA256 hex over WebCrypto (available in Deno and in Node/jsdom).
export async function hashIdentifier(value: string, secret: string): Promise<string> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    "raw",
    enc.encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(value));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

export interface AttemptCounts {
  by_email_1h: number;
  by_ip_1h: number;
  /** Rejections across everyone in the last 10 minutes (card-testing storm). */
  rejected_10m: number;
  /** Rejections from this IP in the last 10 minutes (absent on older RPCs). */
  rejected_10m_ip?: number;
}

export interface CheckoutLimits {
  perEmailPerHour: number;
  perIpPerHour: number;
  /** Per-IP: a few declines and that IP is out for 10 minutes. */
  rejectionsPer10MinPerIp: number;
  /** Global ceiling, high enough that one attacker cannot trip it alone. */
  rejectionsPer10Min: number;
}

export const DEFAULT_LIMITS: CheckoutLimits = {
  perEmailPerHour: 5,
  perIpPerHour: 10,
  rejectionsPer10MinPerIp: 3,
  rejectionsPer10Min: 100,
};

export type CheckoutAccess =
  | { allowed: true }
  | { allowed: false; reason: "rate_limited"; httpStatus: 429 }
  | { allowed: false; reason: "circuit_open"; httpStatus: 503 };

// The attempt counts already include the attempt being decided (the RPC
// inserts before counting), hence the strict "greater than" on those; the
// rejection counts do not include it (it has not been decided yet).
export function decideCheckoutAccess(counts: AttemptCounts, limits: CheckoutLimits = DEFAULT_LIMITS): CheckoutAccess {
  if ((counts.rejected_10m_ip ?? 0) >= limits.rejectionsPer10MinPerIp || counts.rejected_10m >= limits.rejectionsPer10Min) {
    return { allowed: false, reason: "circuit_open", httpStatus: 503 };
  }
  if (counts.by_email_1h > limits.perEmailPerHour || counts.by_ip_1h > limits.perIpPerHour) {
    return { allowed: false, reason: "rate_limited", httpStatus: 429 };
  }
  return { allowed: true };
}

// Digits only, 11 long, not all equal, both check digits valid.
export function isValidCpf(digits: string): boolean {
  if (!/^\d{11}$/.test(digits) || /^(\d)\1{10}$/.test(digits)) return false;
  const calc = (len: number) => {
    let sum = 0;
    for (let i = 0; i < len; i++) sum += Number(digits[i]) * (len + 1 - i);
    const rest = (sum * 10) % 11;
    return rest === 10 ? 0 : rest;
  };
  return calc(9) === Number(digits[9]) && calc(10) === Number(digits[10]);
}

// The Brick reports the card holder's document; only a valid CPF is kept.
export function extractCpf(payer: { identification?: { type?: string; number?: string } } | undefined): string | null {
  const ident = payer?.identification;
  if (!ident || typeof ident.number !== "string") return null;
  if (ident.type && ident.type.toUpperCase() !== "CPF") return null;
  const digits = ident.number.replace(/\D/g, "");
  return isValidCpf(digits) ? digits : null;
}
