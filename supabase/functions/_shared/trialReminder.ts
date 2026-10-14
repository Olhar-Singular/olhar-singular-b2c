// The 48-hour reminder of a card trial's first charge (CDC art. 6 III and 39;
// card-network rules for free trials). pg_cron calls send-trial-reminders every
// hour; this module is its logic: claim the due rows (claim_trial_reminders
// marks them in one UPDATE ... RETURNING, so two runs never e-mail twice), build
// and send one reminder each, and release the rows whose send failed so the
// next hour retries. Logs name the subscription, never the addressee.

import type { EmailMessage, SendEmailResult } from "./email.ts";
import { escapeHtml, formatBrl, formatDateBr, greeting, type BuiltEmail } from "./subscriptionEmails.ts";

export interface TrialReminderRow {
  subscriptionId: string;
  userId: string;
  email: string;
  fullName: string | null;
  trialEndsAt: Date;
  planName: string;
  priceBrl: number;
  monthlyCredits: number;
}

/** One row of claim_trial_reminders() as PostgREST returns it (numeric may come as text). */
export interface ClaimedTrialReminderRaw {
  subscription_id: string;
  user_id: string;
  payer_email: string;
  full_name: string | null;
  trial_ends_at: string;
  plan_name: string;
  price_brl: number | string;
  monthly_credits: number;
}

export function toTrialReminderRow(raw: ClaimedTrialReminderRaw): TrialReminderRow {
  return {
    subscriptionId: raw.subscription_id,
    userId: raw.user_id,
    email: raw.payer_email,
    fullName: raw.full_name,
    trialEndsAt: new Date(raw.trial_ends_at),
    planName: raw.plan_name,
    priceBrl: Number(raw.price_brl),
    monthlyCredits: raw.monthly_credits,
  };
}

export interface TrialReminderEmailInput {
  fullName: string | null;
  planName: string;
  priceBrl: number;
  monthlyCredits: number;
  trialEndsAt: Date;
  /** Public app URL without a trailing slash (APP_URL). */
  appUrl: string;
}

/**
 * The civil day before `date` in São Paulo, as dd/mm/aaaa. Built from the
 * formatted local date (not from `date - 24 h`), so a future DST change or an
 * instant near midnight never shifts the eve to the wrong day.
 */
export function formatEveBr(date: Date): string {
  const [day, month, year] = formatDateBr(date).split("/").map(Number);
  return formatDateBr(new Date(Date.UTC(year, month - 1, day - 1, 12)));
}

export function buildTrialReminderEmail(input: TrialReminderEmailInput): BuiltEmail {
  const price = formatBrl(input.priceBrl);
  const day = formatDateBr(input.trialEndsAt);
  const dayMonth = day.slice(0, 5);
  // MP debits during the charge day itself: the safe deadline is the eve.
  const eve = formatEveBr(input.trialEndsAt);
  const links = { creditos: `${input.appUrl}/creditos`, termos: `${input.appUrl}/termos`, reembolso: `${input.appUrl}/reembolso` };

  const subject = `Seu teste grátis termina em ${dayMonth}: cobramos ${price} nesse dia, cancele se não quiser continuar`;
  const charge = `Seu teste grátis termina em ${day}. Nesse dia cobramos ${price} no cartão e seu plano vira ${input.planName}, com ${input.monthlyCredits} créditos por mês.`;
  const cancelText = `Para não ser cobrado, cancele antes de ${day}, ou seja, até o dia ${eve}, em Créditos (${links.creditos}), com um clique: nada é cobrado e o acesso encerra na hora.`;
  const cancelHtml = `Para não ser cobrado, cancele antes de ${escapeHtml(day)}, ou seja, até o dia ${escapeHtml(eve)}, em <a href="${escapeHtml(links.creditos)}">Créditos</a>, com um clique: nada é cobrado e o acesso encerra na hora.`;
  const stay = "Se quiser continuar, não precisa fazer nada.";
  const refund = "Depois da cobrança, o estorno integral da última cobrança continua disponível em Créditos, em autoatendimento.";

  const text = [
    greeting(input.fullName),
    "",
    charge,
    "",
    cancelText,
    "",
    stay,
    "",
    refund,
    "",
    `Termos de Uso: ${links.termos}`,
    `Política de Reembolso: ${links.reembolso}`,
    "",
    "Olhar Singular",
  ].join("\n");

  const p = (content: string) => `<p style="margin:0 0 16px">${content}</p>`;
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;color:#1f2430;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
${p(`<strong>${escapeHtml(greeting(input.fullName))}</strong>`)}
${p(escapeHtml(charge))}
${p(`<strong>${cancelHtml}</strong>`)}
${p(escapeHtml(stay))}
${p(escapeHtml(refund))}
${p([`<a href="${escapeHtml(links.termos)}">Termos de Uso</a>`, `<a href="${escapeHtml(links.reembolso)}">Política de Reembolso</a>`].join(" · "))}
<p style="margin:24px 0 0;color:#5b6170;font-size:14px">Olhar Singular</p>
</div>
</body>
</html>
`;

  return { subject, html, text };
}

export interface TrialReminderDeps {
  /** claim_trial_reminders(): marks and returns the due rows. A failure here propagates (nothing was marked). */
  claim(): Promise<TrialReminderRow[]>;
  /** release_trial_reminder(id): re-arms a row whose send failed. */
  release(subscriptionId: string): Promise<void>;
  sendEmail(message: EmailMessage): Promise<SendEmailResult>;
  /** Warnings: failed sends, releases. */
  log(message: string, ...args: unknown[]): void;
  /** Info: the one line of a successful send (defaults to console.log). */
  info?(message: string, ...args: unknown[]): void;
  appUrl: string;
}

export interface TrialReminderSummary {
  claimed: number;
  sent: number;
  failed: number;
}

function describe(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}

/**
 * One hourly run. Per row nothing throws: a refused or exploding send counts as
 * failed and releases the row; a failing release is logged (the row stays
 * claimed, so support can see it) and the loop moves on.
 */
export async function runTrialReminders(deps: TrialReminderDeps): Promise<TrialReminderSummary> {
  const rows = await deps.claim();
  const summary: TrialReminderSummary = { claimed: rows.length, sent: 0, failed: 0 };

  for (const row of rows) {
    let outcome: SendEmailResult;
    try {
      // The build is inside the try as well: a row Intl cannot render (bad
      // timestamp) must be released like any other failure, never abort the loop.
      const built = buildTrialReminderEmail({ ...row, appUrl: deps.appUrl });
      outcome = await deps.sendEmail({ to: row.email, ...built, tags: [{ name: "type", value: "trial_reminder" }] });
    } catch (e) {
      // sendEmail never throws by contract; a dep that does is still a failed send.
      deps.log("trial-reminders: send threw, released", row.subscriptionId, e instanceof Error ? e.name : typeof e);
      await release(deps, row.subscriptionId);
      summary.failed++;
      continue;
    }
    if (outcome.ok) {
      summary.sent++;
      (deps.info ?? console.log)("trial-reminders: sent", row.subscriptionId, outcome.id);
      continue;
    }
    summary.failed++;
    deps.log("trial-reminders: send failed, released", row.subscriptionId, outcome.reason);
    await release(deps, row.subscriptionId);
  }

  return summary;
}

async function release(deps: TrialReminderDeps, subscriptionId: string): Promise<void> {
  try {
    await deps.release(subscriptionId);
  } catch (e) {
    deps.log("trial-reminders: release failed, row stays claimed", subscriptionId, describe(e));
  }
}
