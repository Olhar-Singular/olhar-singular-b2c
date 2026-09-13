// The anonymous checkout around runSubscribe: rate limit, account creation with
// a random password, the subscription itself, and the post-payment writes (CPF,
// terms, session token). All decisions here, dependencies injected, so the
// "session only with a payment" rule is unit-tested.

import { decideCheckoutAccess, extractCpf, isValidEmail, normalizeEmail, type AttemptCounts } from "./checkoutGuard.ts";
import { runSubscribe, type SubscribeDeps, type SubscribeInput, type SubscribeResult } from "./subscribeFlow.ts";

export interface AccountInput {
  fullName: string;
  email: string;
  termsVersion: string;
}

const NAME_MAX = 120;
const TERMS_RE = /^[a-z0-9.\-]{1,20}$/i;

export type AccountParse =
  | { ok: true; account: AccountInput }
  | { ok: false; error: "invalid_account" | "invalid_email" | "terms_required" };

// { account: { fullName, email, termsVersion } } from an anonymous checkout.
export function parseAccountInput(value: unknown): AccountParse {
  if (typeof value !== "object" || value === null) return { ok: false, error: "invalid_account" };
  const { fullName, email, termsVersion } = value as Record<string, unknown>;
  if (typeof fullName !== "string" || fullName.trim().length < 2 || fullName.length > NAME_MAX) {
    return { ok: false, error: "invalid_account" };
  }
  if (typeof email !== "string" || !isValidEmail(email.trim())) return { ok: false, error: "invalid_email" };
  if (typeof termsVersion !== "string" || !TERMS_RE.test(termsVersion)) return { ok: false, error: "terms_required" };
  return {
    ok: true,
    account: { fullName: fullName.trim(), email: email.trim().toLowerCase(), termsVersion },
  };
}

export interface CheckoutInput {
  /** Set when a valid user JWT came with the request (logged-in flow). */
  user: { id: string; email: string } | null;
  /** Required when `user` is null. */
  account: AccountInput | null;
  planSlug: string;
  card: SubscribeInput["card"];
  cardLastFour?: string | null;
  backUrl: string;
  attribution?: Record<string, unknown>;
  clientIp: string;
}

export interface CheckoutDeps {
  subscribeDeps: SubscribeDeps;
  hash(value: string): Promise<string>;
  /** Inserts the attempt and returns the rolling counts (RPC record_checkout_attempt). */
  recordAttempt(ipHash: string, emailHash: string, outcome: "attempt" | "authorized" | "pending" | "rejected" | "refused"): Promise<AttemptCounts>;
  /** auth.admin.createUser with a random password; "exists" when the e-mail is taken. */
  createUser(input: { email: string; fullName: string }): Promise<{ id: string } | "exists">;
  /** Writes cpf (only when NULL) and the terms acceptance on the profile. */
  recordProfileFacts(input: { userId: string; cpf: string | null; termsVersion: string | null }): Promise<void>;
  /** auth.admin.generateLink magiclink → hashed_token, or null on failure. */
  generateSessionToken(email: string): Promise<string | null>;
  log(message: string, ...args: unknown[]): void;
}

export type CheckoutResult =
  | { ok: true; result: Extract<SubscribeResult, { ok: true }>; userId: string; accountCreated: boolean; sessionTokenHash: string | null }
  | { ok: false; error: "account_required" | "rate_limited" | "circuit_open" | "email_exists" | Extract<SubscribeResult, { ok: false }>["error"]; httpStatus: number };

export async function runAnonymousCheckout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutResult> {
  if (!input.user && !input.account) return { ok: false, error: "account_required", httpStatus: 400 };

  const email = input.user?.email ?? input.account!.email;
  const [ipHash, emailHash] = await Promise.all([
    deps.hash(input.clientIp),
    deps.hash(normalizeEmail(email)),
  ]);

  // Logged-in users are not anonymous, but their attempts still feed the
  // circuit breaker and the per-IP count (card testing from a real account).
  const counts = await deps.recordAttempt(ipHash, emailHash, "attempt");
  const access = decideCheckoutAccess(counts);
  if (!access.allowed) {
    await deps.recordAttempt(ipHash, emailHash, "refused");
    return { ok: false, error: access.reason, httpStatus: access.httpStatus };
  }

  let userId: string;
  let accountCreated = false;
  if (input.user) {
    userId = input.user.id;
  } else {
    const created = await deps.createUser({ email, fullName: input.account!.fullName });
    if (created === "exists") return { ok: false, error: "email_exists", httpStatus: 409 };
    userId = created.id;
    accountCreated = true;
  }

  const result = await runSubscribe(
    {
      userId,
      email,
      planSlug: input.planSlug,
      card: input.card,
      cardLastFour: input.cardLastFour,
      backUrl: input.backUrl,
      attribution: input.attribution,
    },
    deps.subscribeDeps,
  );

  if (!result.ok) {
    // The account (if just created) stays: decision 14. No session either.
    return { ok: false, error: result.error, httpStatus: result.httpStatus };
  }

  await deps.recordAttempt(ipHash, emailHash, result.status);

  if (result.status === "rejected") {
    // Never hand a session to someone who only proved they hold a card token:
    // with a fresh account they log in through the e-mail link instead.
    return { ok: true, result, userId, accountCreated, sessionTokenHash: null };
  }

  // Money (or a pending validation) happened: record the contractual facts.
  await deps.recordProfileFacts({
    userId,
    cpf: extractCpf(input.card.payer),
    termsVersion: input.account?.termsVersion ?? null,
  });

  let sessionTokenHash: string | null = null;
  if (accountCreated) {
    sessionTokenHash = await deps.generateSessionToken(email);
    if (!sessionTokenHash) deps.log("checkout: magic link generation failed, buyer will log in by e-mail", userId);
  }

  return { ok: true, result, userId, accountCreated, sessionTokenHash };
}
