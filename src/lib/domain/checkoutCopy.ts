// Copy and dates behind the checkout (spec 2026-11-15-checkout-conversao):
// plans told in adapted activities instead of credits, and the trial
// timeline (today, reminder, first charge). Pure, so the page stays thin.

import { addDays, differenceInCalendarDays, format } from "date-fns";
import { ADAPTATION_CREDITS } from "@/lib/domain/barriers";
import { formatBrl, TRIAL_DAYS, trialFirstChargeDate } from "@/lib/domain/subscriptionUi";
import type { PlanView } from "@/hooks/useSubscription";

export function adaptationsPerMonth(credits: number): { min: number; max: number } {
  return {
    min: Math.floor(credits / ADAPTATION_CREDITS.high),
    max: Math.floor(credits / ADAPTATION_CREDITS.low),
  };
}

export function planAdaptationsLabel(plan: PlanView): string {
  const { min, max } = adaptationsPerMonth(plan.monthlyCredits);
  return `${min} a ${max} atividades adaptadas por mês`;
}

// Rounded UP to the cent: "a partir de" must never sit below the real price.
// Integer cents avoid float noise (39.9 * 100 = 3990.0000000000005).
export function pricePerAdaptationLabel(plan: PlanView): string {
  const { max } = adaptationsPerMonth(plan.monthlyCredits);
  const cents = Math.round(plan.priceBrl * 100);
  return `a partir de ${formatBrl(Math.ceil(cents / max) / 100)} por adaptação`;
}

export interface TrialStep {
  key: "today" | "reminder" | "charge";
  date: Date;
  /** Day of the trial, counting the start as day 1. */
  dayNumber: number;
}

// The reminder goes out 48 h before the first charge (claim_trial_reminders).
const REMINDER_DAYS_BEFORE_CHARGE = 2;

export function trialTimeline(start: Date): TrialStep[] {
  const charge = trialFirstChargeDate(start);
  const reminder = addDays(start, TRIAL_DAYS - REMINDER_DAYS_BEFORE_CHARGE);
  const step = (key: TrialStep["key"], date: Date): TrialStep => ({
    key,
    date,
    dayNumber: differenceInCalendarDays(date, start) + 1,
  });
  return [step("today", start), step("reminder", reminder), step("charge", charge)];
}

export function formatDayMonth(date: Date): string {
  return format(date, "dd/MM");
}
