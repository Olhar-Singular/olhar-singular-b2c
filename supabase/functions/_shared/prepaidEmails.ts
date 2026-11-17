// The receipt of a Pix prepaid plan (spec 2026-11-15-checkout-pix-a-vista,
// Decreto 7.962 art. 4): what was bought, the price, how long it lasts, the
// two-part release (R1) and the 7-day guarantee (R2). Pure builder plus a thin
// sender over email.ts, like subscriptionEmails.ts. No em dash anywhere.

import { sendEmail, type EmailDeps, type SendEmailResult } from "./email.ts";
import { prepaidMonthsLabel } from "./prepaidPlans.ts";
import { escapeHtml, formatBrl, formatDateBr, greeting, type BuiltEmail } from "./subscriptionEmails.ts";

/** Days of the full-refund guarantee; the locked part unlocks right after it. */
export const PREPAID_GUARANTEE_DAYS = 7;

export interface PrepaidConfirmationInput {
  fullName: string | null;
  months: number;
  /** Total credits of the plan. */
  credits: number;
  /** Credits already in the account (one month's quota). */
  creditsNow: number;
  /** Credits that arrive on the 8th day; 0 for a 1-month plan. */
  creditsLocked: number;
  unlockAt: Date | null;
  periodEnd: Date;
  amountBrl: number;
  paidAt: Date;
  /** TERMS_VERSION accepted at checkout; null when a logged-in buyer did not re-accept. */
  termsVersion: string | null;
  /** Public app URL without a trailing slash (APP_URL). */
  appUrl: string;
}

export function buildPrepaidConfirmationEmail(input: PrepaidConfirmationInput): BuiltEmail {
  if (input.creditsLocked > 0 && !input.unlockAt) throw new Error("prepaid confirmation: a locked part needs unlockAt");
  const period = prepaidMonthsLabel(input.months);
  const price = formatBrl(input.amountBrl);
  const guaranteeEnd = new Date(input.paidAt.getTime() + PREPAID_GUARANTEE_DAYS * 24 * 60 * 60 * 1000);
  const links = {
    termos: `${input.appUrl}/termos`,
    privacidade: `${input.appUrl}/privacidade`,
    reembolso: `${input.appUrl}/reembolso`,
    creditos: `${input.appUrl}/creditos`,
  };

  const subject = `Seu plano à vista de ${period} está confirmado`;
  const opening = `Recebemos o seu Pix. Seu plano à vista de ${period} está confirmado.`;
  const validity = `Acesso até ${formatDateBr(input.periodEnd)}.`;
  const release = input.creditsLocked > 0
    ? `${input.creditsNow} créditos já estão na sua conta; os outros ${input.creditsLocked} entram em ${formatDateBr(input.unlockAt as Date)}, depois do prazo de garantia.`
    : `Os ${input.creditsNow} créditos já estão na sua conta.`;
  const once = "Pagamento único. Nada é cobrado de novo sem você pedir.";
  const guarantee = `Garantia de ${PREPAID_GUARANTEE_DAYS} dias: se não servir para a sua realidade de sala, peça até ${formatDateBr(guaranteeEnd)} pelo suporte e devolvemos o valor integral.`;
  const terms = input.termsVersion ? `Versão dos Termos de Uso aceita: ${input.termsVersion}` : null;
  const paidAt = `Pagamento em ${formatDateBr(input.paidAt)}.`;
  const keep = "Guarde este e-mail: ele é o seu comprovante da contratação.";

  const text = [
    greeting(input.fullName),
    "",
    opening,
    "",
    `Plano: à vista, ${period}`,
    `Valor pago: ${price} (pagamento único, no Pix)`,
    `Créditos: ${input.credits} no total`,
    "",
    validity,
    "",
    release,
    "",
    once,
    "",
    guarantee,
    "",
    ...(terms ? [terms, ""] : []),
    `Termos de Uso: ${links.termos}`,
    `Política de Privacidade: ${links.privacidade}`,
    `Política de Reembolso: ${links.reembolso}`,
    `Créditos (seu plano): ${links.creditos}`,
    "",
    paidAt,
    "",
    keep,
    "",
    "Olhar Singular",
  ].join("\n");

  const e = escapeHtml;
  const p = (content: string) => `<p style="margin:0 0 16px">${content}</p>`;
  const row = (label: string, value: string) =>
    `<tr><td style="padding:4px 16px 4px 0;color:#5b6170">${label}</td><td style="padding:4px 0">${value}</td></tr>`;
  const html = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${e(subject)}</title>
</head>
<body style="margin:0;padding:24px;background:#f6f5f2;font-family:Arial,Helvetica,sans-serif;color:#1f2430;font-size:16px;line-height:1.5">
<div style="max-width:560px;margin:0 auto;background:#ffffff;border-radius:12px;padding:32px">
${p(`<strong>${e(greeting(input.fullName))}</strong>`)}
${p(e(opening))}
<table role="presentation" cellpadding="0" cellspacing="0" style="margin:0 0 16px;border-collapse:collapse">
${row("Plano", `<strong>à vista, ${e(period)}</strong>`)}
${row("Valor pago", `${e(price)} (pagamento único, no Pix)`)}
${row("Créditos", `${input.credits} no total`)}
</table>
${p(e(validity))}
${p(e(release))}
${p(e(once))}
${p(e(guarantee))}
${terms ? p(e(terms)) : ""}
${p([
  `<a href="${e(links.termos)}">Termos de Uso</a>`,
  `<a href="${e(links.privacidade)}">Política de Privacidade</a>`,
  `<a href="${e(links.reembolso)}">Política de Reembolso</a>`,
  `<a href="${e(links.creditos)}">Créditos (seu plano)</a>`,
].join(" · "))}
${p(e(paidAt))}
${p(`<strong>${e(keep)}</strong>`)}
<p style="margin:24px 0 0;color:#5b6170;font-size:14px">Olhar Singular</p>
</div>
</body>
</html>
`;

  return { subject, html, text };
}

/** `async` so a builder failure becomes a rejection the caller logs; sendEmail never rejects. */
export async function sendPrepaidConfirmation(
  deps: EmailDeps,
  input: PrepaidConfirmationInput & { to: string },
): Promise<SendEmailResult> {
  const { to, ...content } = input;
  const built = buildPrepaidConfirmationEmail(content);
  return sendEmail(deps, { to, ...built, tags: [{ name: "type", value: "prepaid_confirmation" }] });
}
