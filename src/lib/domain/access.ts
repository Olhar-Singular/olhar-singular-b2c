// Access state derived from the two credit buckets and the account kind.
//
// The server applies the same rule inside consume_credits (the real gate); the
// client uses this to render balances, banners and the soft paywall before a
// request is even made. Pure and date-injected so it is fully unit-tested.

export type AccessKind = "subscriber" | "trial" | "exempt" | "legacy";

/** The profile columns this module reads. */
export interface AccessProfile {
  access_kind: string;
  plan_credits: number;
  plan_period_end: string | null;
  credit_balance: number;
  trial_started_at: string | null;
  must_set_password: boolean;
}

export interface Access {
  kind: AccessKind;
  /** Plan (or trial) credits still usable: 0 once the period is over. */
  planCredits: number;
  /** Extras: never expire. */
  extraCredits: number;
  total: number;
  /** Courtesy account: nothing is ever debited. */
  unlimited: boolean;
  /** No credit left and not exempt: paid actions are blocked. */
  paywalled: boolean;
  periodEnd: Date | null;
  /** Whole days left of a running trial; null for other kinds. */
  daysLeft: number | null;
  trialExpired: boolean;
  mustSetPassword: boolean;
}

const KINDS: readonly AccessKind[] = ["subscriber", "trial", "exempt", "legacy"];
const DAY_MS = 24 * 60 * 60 * 1000;

// strictNullChecks is off in this project: normalize explicitly instead of
// relying on narrowing.
export function parseIsoOrNull(value: string | null | undefined): Date | null {
  if (!value) return null;
  const time = Date.parse(value);
  return Number.isNaN(time) ? null : new Date(time);
}

export function computeAccess(profile: AccessProfile | null, now: Date): Access | null {
  if (!profile) return null;

  const kind: AccessKind = KINDS.includes(profile.access_kind as AccessKind)
    ? (profile.access_kind as AccessKind)
    : "subscriber";
  const periodEnd = parseIsoOrNull(profile.plan_period_end);
  const periodActive = periodEnd !== null && periodEnd.getTime() > now.getTime();

  const planCredits = periodActive ? profile.plan_credits : 0;
  const extraCredits = profile.credit_balance;
  const total = planCredits + extraCredits;
  const unlimited = kind === "exempt";

  const isTrial = kind === "trial";
  const daysLeft = isTrial
    ? periodActive
      ? Math.ceil((periodEnd!.getTime() - now.getTime()) / DAY_MS)
      : 0
    : null;

  return {
    kind,
    planCredits,
    extraCredits,
    total,
    unlimited,
    paywalled: !unlimited && total === 0,
    periodEnd,
    daysLeft,
    trialExpired: isTrial && !periodActive && periodEnd !== null,
    mustSetPassword: profile.must_set_password,
  };
}

export function canAfford(access: Access | null, cost: number): boolean {
  if (!access) return false;
  if (access.unlimited) return true;
  return access.total >= cost;
}

const creditsLabel = (n: number) => `${n} ${n === 1 ? "crédito" : "créditos"}`;

/**
 * First sentence of every "not enough credits" notice (Passo 3 and Passo 4).
 * "Acabaram" only when nothing is left: a teacher with 10 credits facing a
 * cost of 12 needs to read how many they have and what it costs (0470).
 */
export function insufficientCreditsLead(balance: number | null, cost: number | null): string {
  if (!balance || balance <= 0 || cost === null) return "Seus créditos acabaram.";
  return `Você tem ${creditsLabel(balance)}; esta adaptação custa ${cost}.`;
}

/** Full notice, offering both ways out the screens offer (subscribe or buy extras). */
export function insufficientCreditsMessage(balance: number | null, cost: number | null): string {
  return `${insufficientCreditsLead(balance, cost)} Assine um plano ou compre créditos extras para continuar.`;
}
