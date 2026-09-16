// The anonymous checkout around runSubscribe: rate limit, account creation with
// a random password, the subscription itself, and the post-payment writes (CPF,
// terms). No session is ever handed back here: the buyer proves ownership of
// the e-mail through the login link the client requests (signInWithOtp), which
// is what stops someone from paying to open an account in a stranger's name.

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
  /** Trial with card: anonymous funnel only, one per CPF (decisions 1 and 4). */
  trial?: boolean;
  /** Clock, injectable for tests. */
  now?: Date;
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
  /** RPC trial_used_by_cpf: this CPF already ran a trial or held a subscription. */
  trialUsedByCpf(cpf: string): Promise<boolean>;
  /** auth.admin.deleteUser: undoes an account created seconds ago by a refused trial card. */
  deleteUser(userId: string): Promise<void>;
  log(message: string, ...args: unknown[]): void;
}

export type CheckoutResult =
  | { ok: true; result: Extract<SubscribeResult, { ok: true }>; userId: string; accountCreated: boolean }
  | {
      ok: false;
      error:
        | "account_required" | "rate_limited" | "circuit_open" | "email_exists"
        | "trial_requires_new_account" | "cpf_required" | "trial_used"
        | Extract<SubscribeResult, { ok: false }>["error"];
      httpStatus: number;
    };

export async function runAnonymousCheckout(input: CheckoutInput, deps: CheckoutDeps): Promise<CheckoutResult> {
  if (!input.user && !input.account) return { ok: false, error: "account_required", httpStatus: 400 };

  // Whoever has an account subscribes paid at /assinar (decision: trial = new account).
  if (input.trial && input.user) return { ok: false, error: "trial_requires_new_account", httpStatus: 400 };

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

  if (input.trial) {
    // One trial per CPF (decision 4), checked BEFORE the account exists so a
    // barred CPF never leaves an orphan account. The Brick always sends the
    // CPF; only a scripted caller reaches cpf_required.
    const cpf = extractCpf(input.card.payer);
    if (!cpf) return { ok: false, error: "cpf_required", httpStatus: 400 };
    if (await deps.trialUsedByCpf(cpf)) return { ok: false, error: "trial_used", httpStatus: 409 };
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
      trial: input.trial,
      now: input.now,
    },
    deps.subscribeDeps,
  );

  if (!result.ok) {
    // The account (if just created) stays: decision 14. No session either.
    return { ok: false, error: result.error, httpStatus: result.httpStatus };
  }

  await deps.recordAttempt(ipHash, emailHash, result.status);

  if (result.status === "rejected") {
    if (input.trial && accountCreated) {
      // The trial account holds nothing worth keeping yet: no CPF, no terms,
      // no credits, and MP has nothing pending for a synchronous rejection
      // (recordAttempt(..., "rejected") already ran above). Deleting it is a
      // rollback, not a data loss, and lets the same e-mail simply try
      // another card instead of hitting email_exists (or, if logged in
      // later, trial_requires_new_account) on a dead-end account.
      try {
        await deps.deleteUser(userId);
        accountCreated = false;
      } catch (e) {
        deps.log("subscribe: ALERT could not delete the account of a refused trial card", userId, e);
      }
    }
    // The account (if just created, and not deleted above) stays: decision 14.
    return { ok: true, result, userId, accountCreated };
  }

  // Money (or a pending validation) happened: record the contractual facts.
  await deps.recordProfileFacts({
    userId,
    cpf: extractCpf(input.card.payer),
    termsVersion: input.account?.termsVersion ?? null,
  });

  return { ok: true, result, userId, accountCreated };
}
