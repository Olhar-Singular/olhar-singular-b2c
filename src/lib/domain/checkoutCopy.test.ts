import { describe, it, expect } from "vitest";
import type { PlanView } from "@/hooks/useSubscription";
import { adaptationsPerMonth, formatDayMonth, planAdaptationsLabel, pricePerAdaptationLabel, trialTimeline } from "./checkoutCopy";

const plan = (slug: string, priceBrl: number, monthlyCredits: number): PlanView => ({
  id: slug,
  slug,
  name: slug,
  priceBrl,
  monthlyCredits,
  highlight: false,
  adminOnly: false,
});
const BASICO = plan("basico", 39.9, 300);
const PROFISSIONAL = plan("profissional", 59.9, 480);
const AVANCADO = plan("avancado", 99.9, 900);

describe("adaptationsPerMonth", () => {
  it("divides by the highest and lowest adaptation cost", () => {
    expect(adaptationsPerMonth(300)).toEqual({ min: 25, max: 60 });
    expect(adaptationsPerMonth(480)).toEqual({ min: 40, max: 96 });
    expect(adaptationsPerMonth(900)).toEqual({ min: 75, max: 180 });
  });
});

describe("planAdaptationsLabel", () => {
  it("speaks in adapted activities", () => {
    expect(planAdaptationsLabel(BASICO)).toBe("25 a 60 atividades adaptadas por mês");
  });
});

describe("pricePerAdaptationLabel", () => {
  it("rounds UP to the cent, never advertising less than the real price", () => {
    expect(pricePerAdaptationLabel(BASICO)).toMatch(/^a partir de R\$\s0,67 por adaptação$/); // 39,90/60 = 0,665
    expect(pricePerAdaptationLabel(PROFISSIONAL)).toMatch(/R\$\s0,63/); // 59,90/96 = 0,624
    expect(pricePerAdaptationLabel(AVANCADO)).toMatch(/R\$\s0,56/); // 99,90/180 = 0,555
  });

  it("keeps an exact cent as is", () => {
    expect(pricePerAdaptationLabel(plan("redondo", 60, 300))).toMatch(/R\$\s1,00/); // 60/60 = 1,00
  });
});

describe("trialTimeline", () => {
  it("is today (day 1), the reminder 48 h before the charge (day 6) and the charge (day 8)", () => {
    const steps = trialTimeline(new Date(2026, 10, 13, 15, 0));
    expect(steps.map((s) => [s.key, formatDayMonth(s.date), s.dayNumber])).toEqual([
      ["today", "13/11", 1],
      ["reminder", "18/11", 6],
      ["charge", "20/11", 8],
    ]);
  });

  it("crosses a month boundary", () => {
    expect(trialTimeline(new Date(2026, 10, 28)).map((s) => formatDayMonth(s.date))).toEqual(["28/11", "03/12", "05/12"]);
  });
});
