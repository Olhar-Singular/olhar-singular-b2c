import { describe, it, expect } from "vitest";
import { prepaidActiveMessage, prepaidDescription, selectPrepaidPlan, toPrepaidPlan, type PrepaidPlanRow } from "./prepaidPlans";

const ROWS: PrepaidPlanRow[] = [
  { id: "pp-1", slug: "pix-1-mes", months: 1, credits: 300, price_brl: "39.90", active: true, admin_only: false },
  { id: "pp-3", slug: "pix-3-meses", months: 3, credits: 900, price_brl: 89.9, active: true, admin_only: false },
  { id: "pp-old", slug: "pix-6-meses", months: 6, credits: 1800, price_brl: 199, active: false, admin_only: false },
  { id: "pp-test", slug: "pix-teste-admin", months: 1, credits: 1, price_brl: 1, active: true, admin_only: true },
];

describe("toPrepaidPlan", () => {
  it("maps a row, parsing the numeric price PostgREST sends as a string", () => {
    expect(toPrepaidPlan(ROWS[0])).toEqual({ id: "pp-1", slug: "pix-1-mes", months: 1, credits: 300, priceBrl: 39.9, adminOnly: false });
  });
});

describe("selectPrepaidPlan", () => {
  it("returns the active public offer with that slug", () => {
    expect(selectPrepaidPlan(ROWS, "pix-3-meses")?.id).toBe("pp-3");
  });

  it("refuses a non-string, unknown or inactive slug", () => {
    expect(selectPrepaidPlan(ROWS, 3)).toBeNull();
    expect(selectPrepaidPlan(ROWS, "")).toBeNull();
    expect(selectPrepaidPlan(ROWS, "pix-99-meses")).toBeNull();
    expect(selectPrepaidPlan(ROWS, "pix-6-meses")).toBeNull();
  });

  it("sells the admin-only smoke offer to super-admins only", () => {
    expect(selectPrepaidPlan(ROWS, "pix-teste-admin")).toBeNull();
    expect(selectPrepaidPlan(ROWS, "pix-teste-admin", { allowAdminOnly: true })?.credits).toBe(1);
  });
});

describe("prepaidDescription", () => {
  it("names the period, with a plain hyphen", () => {
    expect(prepaidDescription(toPrepaidPlan(ROWS[1]))).toBe("Plano à vista 3 meses - Olhar Singular");
    expect(prepaidDescription(toPrepaidPlan(ROWS[0]))).toBe("Plano à vista 1 mês - Olhar Singular");
  });
});

describe("prepaidActiveMessage", () => {
  it("tells the card buyer until when the Pix plan runs, in Brazilian time", () => {
    expect(prepaidActiveMessage("2027-02-16T01:00:00.000Z")).toBe(
      "Você tem um plano à vista ativo até 15/02/2027. Para continuar, renove no Pix ou assine no cartão depois dessa data.",
    );
  });
});
