import { describe, it, expect } from "vitest";
import {
  DEFAULT_PREPAID_PLANS,
  activePrepaid,
  basePrepaidPlan,
  prepaidCardLines,
  prepaidCreditsSplit,
  prepaidMonthsLabel,
  prepaidReleaseLabel,
  prepaidSavings,
  prepaidSummary,
  publicPrepaidPlans,
  toPrepaidPlanView,
  type PrepaidPlanView,
} from "./prepaid";

const [ONE, THREE, TWELVE] = DEFAULT_PREPAID_PLANS;
// formatBrl (Intl) puts a no-break space after "R$".
const plain = <T,>(value: T): T => JSON.parse(JSON.stringify(value).replace(/\u00a0/g, " "));

describe("DEFAULT_PREPAID_PLANS", () => {
  it("mirrors the seeded catalogue, 3 months highlighted", () => {
    expect(DEFAULT_PREPAID_PLANS.map((p) => [p.slug, p.months, p.credits, p.priceBrl, p.highlight])).toEqual([
      ["pix-1-mes", 1, 300, 39.9, false],
      ["pix-3-meses", 3, 900, 89.9, true],
      ["pix-12-meses", 12, 3600, 329.9, false],
    ]);
  });
});

describe("toPrepaidPlanView", () => {
  it("converts the numeric price PostgREST sends as a string", () => {
    expect(
      toPrepaidPlanView({ id: "x", slug: "pix-3-meses", months: 3, credits: 900, price_brl: "89.90" as unknown as number, highlight: true, admin_only: false }),
    ).toEqual({ id: "x", slug: "pix-3-meses", months: 3, credits: 900, priceBrl: 89.9, highlight: true, adminOnly: false });
  });
});

describe("publicPrepaidPlans", () => {
  const smoke: PrepaidPlanView = { id: "t", slug: "pix-teste-admin", months: 1, credits: 1, priceBrl: 1, highlight: false, adminOnly: true };

  it("hides the admin smoke offer and sorts by months", () => {
    expect(publicPrepaidPlans([TWELVE, smoke, ONE, THREE])).toEqual([ONE, THREE, TWELVE]);
  });

  it("falls back to the defaults when nothing public came back", () => {
    expect(publicPrepaidPlans(undefined)).toEqual(DEFAULT_PREPAID_PLANS);
    expect(publicPrepaidPlans([smoke])).toEqual(DEFAULT_PREPAID_PLANS);
  });
});

describe("basePrepaidPlan", () => {
  it("is the shortest plan, the reference for the savings", () => {
    expect(basePrepaidPlan([TWELVE, THREE, ONE])).toBe(ONE);
    expect(basePrepaidPlan([ONE, TWELVE])).toBe(ONE);
    expect(basePrepaidPlan([])).toBeNull();
  });
});

describe("prepaidSavings", () => {
  it("rounds the percentage down and the monthly price up to the cent", () => {
    expect(prepaidSavings(THREE, ONE)).toEqual({ percent: 24, monthly: 29.97 });
    expect(prepaidSavings(TWELVE, ONE)).toEqual({ percent: 31, monthly: 27.5 });
  });

  it("has no savings for the base plan itself", () => {
    expect(prepaidSavings(ONE, ONE)).toBeNull();
  });
});

describe("prepaidCreditsSplit", () => {
  it("one month's quota now, the rest on the 8th day", () => {
    expect(prepaidCreditsSplit(THREE)).toEqual({ now: 300, later: 600 });
    expect(prepaidCreditsSplit(TWELVE)).toEqual({ now: 300, later: 3300 });
    expect(prepaidCreditsSplit(ONE)).toEqual({ now: 300, later: 0 });
  });
});

describe("prepaidMonthsLabel", () => {
  it("singular and plural", () => {
    expect(prepaidMonthsLabel(1)).toBe("1 mês");
    expect(prepaidMonthsLabel(3)).toBe("3 meses");
  });
});

describe("prepaidCardLines", () => {
  it("1 month: what it equals per month", () => {
    expect(plain(prepaidCardLines(ONE, ONE))).toEqual({
      headline: "1 MÊS",
      price: "R$ 39,90",
      credits: "300 créditos",
      adaptations: "25 a 60 adaptações",
      savings: null,
      monthly: "Equivale a R$ 39,90 por mês",
    });
  });

  it("3 months: savings and monthly price", () => {
    expect(plain(prepaidCardLines(THREE, ONE))).toEqual({
      headline: "3 MESES",
      price: "R$ 89,90",
      credits: "900 créditos",
      adaptations: "75 a 180 adaptações",
      savings: "Economia de 24%",
      monthly: "R$ 29,97 por mês",
    });
  });

  it("12 months: the whole school year, thousands separated", () => {
    expect(plain(prepaidCardLines(TWELVE, ONE))).toMatchObject({
      headline: "12 MESES",
      price: "R$ 329,90",
      credits: "3.600 créditos",
      adaptations: "o ano letivo inteiro",
      savings: "Economia de 31%",
      monthly: "R$ 27,50 por mês",
    });
  });

  it("without a base plan it still states the monthly price", () => {
    expect(plain(prepaidCardLines(THREE, null))).toMatchObject({ savings: null, monthly: "R$ 29,97 por mês" });
  });
});

describe("prepaidReleaseLabel", () => {
  it("explains the two-part release, with no em dash", () => {
    expect(prepaidReleaseLabel(TWELVE)).toBe(
      "300 créditos entram na hora; os outros 3.300 entram no 8º dia, depois do prazo de garantia.",
    );
    expect(prepaidReleaseLabel(TWELVE)).not.toContain("—");
  });

  it("is null when everything arrives at once", () => {
    expect(prepaidReleaseLabel(ONE)).toBeNull();
  });
});

describe("prepaidSummary", () => {
  it("lines of the order summary", () => {
    expect(plain(prepaidSummary(THREE))).toEqual({
      access: "Acesso por 3 meses",
      credits: "900 créditos",
      payToday: "R$ 89,90",
      once: "Pagamento único. Nada é cobrado de novo sem você pedir.",
    });
  });
});

describe("activePrepaid", () => {
  const NOW = new Date("2026-11-20T12:00:00.000Z");
  const row = (o: Partial<Parameters<typeof activePrepaid>[0][number]> = {}) => ({
    plan_period_end: "2027-02-15T15:00:00+00:00",
    plan_locked_credits: 600,
    plan_unlock_at: "2026-11-22T15:00:00+00:00",
    plan_released_at: null,
    ...o,
  });

  it("is null without a running period", () => {
    expect(activePrepaid([], NOW)).toBeNull();
    expect(activePrepaid([row({ plan_period_end: "2026-11-01T00:00:00Z" })], NOW)).toBeNull();
    expect(activePrepaid([row({ plan_period_end: null })], NOW)).toBeNull();
  });

  it("reports the end of the period and the part still locked", () => {
    expect(activePrepaid([row()], NOW)).toEqual({
      periodEnd: new Date("2027-02-15T15:00:00.000Z"),
      lockedCredits: 600,
      unlockAt: new Date("2026-11-22T15:00:00.000Z"),
    });
  });

  it("sums what a rebuy left locked and keeps the latest end and the earliest unlock", () => {
    const result = activePrepaid([
      row(),
      row({ plan_period_end: "2027-05-15T15:00:00+00:00", plan_locked_credits: 3300, plan_unlock_at: "2026-11-25T15:00:00+00:00" }),
    ], NOW);
    expect(result).toEqual({
      periodEnd: new Date("2027-05-15T15:00:00.000Z"),
      lockedCredits: 3900,
      unlockAt: new Date("2026-11-22T15:00:00.000Z"),
    });
  });

  it("does not depend on the order of the rows", () => {
    const later = row({ plan_period_end: "2027-05-15T15:00:00+00:00", plan_unlock_at: "2026-11-25T15:00:00+00:00" });
    expect(activePrepaid([later, row()], NOW)).toMatchObject({
      periodEnd: new Date("2027-05-15T15:00:00.000Z"),
      unlockAt: new Date("2026-11-22T15:00:00.000Z"),
    });
  });

  it("ignores locked parts already released", () => {
    expect(activePrepaid([row({ plan_released_at: "2026-11-22T15:07:00Z" })], NOW)).toEqual({
      periodEnd: new Date("2027-02-15T15:00:00.000Z"),
      lockedCredits: 0,
      unlockAt: null,
    });
    expect(activePrepaid([row({ plan_locked_credits: null, plan_unlock_at: null })], NOW)).toMatchObject({ lockedCredits: 0, unlockAt: null });
  });
});
