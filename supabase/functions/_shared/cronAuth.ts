// Bearer-secret authorization for the functions pg_cron calls (through pg_net).
// No user, no JWT: the caller proves it is our scheduler by presenting
// CRON_SECRET, compared in constant time so the response time never reveals
// how much of a guess matched.

import { timingSafeEqual } from "./mpSignature.ts";

export type CronAuth = "ok" | "unauthorized" | "misconfigured";

/**
 * `misconfigured` when the function has no secret to compare against (answer
 * 500 and log: nothing can be authorized); `unauthorized` for a missing header,
 * a non-bearer scheme or a token that differs; `ok` otherwise.
 */
export function authorizeCron(authHeader: string | null, secret: string | undefined): CronAuth {
  const expected = secret?.trim();
  if (!expected) return "misconfigured";
  if (!authHeader?.startsWith("Bearer ")) return "unauthorized";
  return timingSafeEqual(authHeader.slice("Bearer ".length).trim(), expected) ? "ok" : "unauthorized";
}
