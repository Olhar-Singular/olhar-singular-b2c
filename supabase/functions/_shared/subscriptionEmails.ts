// The e-mails of the subscription lifecycle. Pure builders (subject, html, text
// in pt-BR, no em dash) plus thin senders over email.ts. The confirmation is the
// buyer's proof of contract (Decreto 7.962 art. 4): plan, price, credits, when
// the card is charged, how to cancel, the accepted terms version and the legal
// links. Never CPF, card data, a login link or anything else about the payment.

import { sendEmail, type EmailDeps, type SendEmailResult } from "./email.ts";
import { TRIAL_DAYS } from "./mpPreapproval.ts";

const TIME_ZONE = "America/Sao_Paulo";

/** "R$ 1.234,50": plain space after R$, comma decimals, dot thousands. */
export function formatBrl(value: number): string {
  const [units, cents] = value.toFixed(2).split(".");
  return `R$ ${units.replace(/\B(?=(\d{3})+(?!\d))/g, ".")},${cents}`;
}

/** dd/mm/aaaa in the Brazilian time zone the contract is written in. */
export function formatDateBr(date: Date): string {
  return new Intl.DateTimeFormat("pt-BR", { timeZone: TIME_ZONE, day: "2-digit", month: "2-digit", year: "numeric" }).format(date);
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export interface SubscriptionConfirmationInput {
  /** profiles.full_name or the checkout's account name; the greeting uses the first word. */
  fullName: string | null;
  planName: string;
  priceBrl: number;
  monthlyCredits: number;
  /** Trial with card: nothing charged today, first charge at trialEndsAt. */
  trial: boolean;
  trialEndsAt: Date | null;
  /** When the contract was made (paid: the charge; trial: the authorization). */
  chargedAt: Date;
  /** TERMS_VERSION accepted at checkout; null when a logged-in user did not re-accept. */
  termsVersion: string | null;
  /** Public app URL without a trailing slash (APP_URL). */
  appUrl: string;
}

export interface BuiltEmail {
  subject: string;
  html: string;
  text: string;
}

/** "Olá, <first name>!" or "Olá!" when the profile has no name. */
export function greeting(fullName: string | null): string {
  const first = fullName?.trim().split(/\s+/)[0];
  return first ? `Olá, ${first}!` : "Olá!";
}

export function buildSubscriptionConfirmationEmail(input: SubscriptionConfirmationInput): BuiltEmail {
  // Intl would print a null date as 31/12/1969 in silence: fail loudly instead
  // (the caller runs in the background and only logs it).
  if (input.trial && !input.trialEndsAt) throw new Error("subscription confirmation: a trial needs trialEndsAt");
  const price = formatBrl(input.priceBrl);
  const links = {
    termos: `${input.appUrl}/termos`,
    privacidade: `${input.appUrl}/privacidade`,
    reembolso: `${input.appUrl}/reembolso`,
    creditos: `${input.appUrl}/creditos`,
  };

  const subject = input.trial
    ? `Seu teste grátis do plano ${input.planName} começou`
    : `Sua assinatura do plano ${input.planName} está confirmada`;

  const opening = input.trial
    ? `Seu teste grátis de ${TRIAL_DAYS} dias do plano ${input.planName} começou.`
    : `Sua assinatura do plano ${input.planName} está confirmada.`;

  const charge = input.trial
    ? `Hoje: ${formatBrl(0)}. Em ${formatDateBr(input.trialEndsAt as Date)} cobramos ${price} no cartão; cancele antes dessa data em Créditos e nada é cobrado. Depois, todo mês na mesma data.`
    : `Cobrado hoje: ${price}. As próximas cobranças acontecem todo mês na mesma data.`;

  const credits = "Os créditos do plano zeram a cada renovação; os créditos extras não expiram.";
  const cancel = "Cancele quando quiser, com um clique, em Créditos; o estorno da última cobrança também é em autoatendimento.";
  const terms = input.termsVersion ? `Versão dos Termos de Uso aceita: ${input.termsVersion}` : null;
  const contractedAt = `Contratação em ${formatDateBr(input.chargedAt)}.`;
  const keep = "Guarde este e-mail: ele é o seu comprovante da contratação.";

  const text = [
    greeting(input.fullName),
    "",
    opening,
    "",
    `Plano: ${input.planName}`,
    `Valor: ${price} por mês`,
    `Créditos: ${input.monthlyCredits} por mês`,
    "",
    charge,
    "",
    credits,
    "",
    cancel,
    "",
    ...(terms ? [terms, ""] : []),
    `Termos de Uso: ${links.termos}`,
    `Política de Privacidade: ${links.privacidade}`,
    `Política de Reembolso: ${links.reembolso}`,
    `Créditos (sua assinatura): ${links.creditos}`,
    "",
    contractedAt,
    "",
    keep,
    "",
    "Olhar Singular",
  ].join("\n");

  const e = escapeHtml;
  const p = (content: string) => `<p style="margin:0 0 16px">${content}</p>`;
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
<tr><td style="padding:4px 16px 4px 0;color:#5b6170">Plano</td><td style="padding:4px 0"><strong>${e(input.planName)}</strong></td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#5b6170">Valor</td><td style="padding:4px 0">${e(price)} por mês</td></tr>
<tr><td style="padding:4px 16px 4px 0;color:#5b6170">Créditos</td><td style="padding:4px 0">${input.monthlyCredits} por mês</td></tr>
</table>
${p(e(charge))}
${p(e(credits))}
${p(e(cancel))}
${terms ? p(e(terms)) : ""}
${p([
  `<a href="${e(links.termos)}">Termos de Uso</a>`,
  `<a href="${e(links.privacidade)}">Política de Privacidade</a>`,
  `<a href="${e(links.reembolso)}">Política de Reembolso</a>`,
  `<a href="${e(links.creditos)}">Créditos (sua assinatura)</a>`,
].join(" · "))}
${p(e(contractedAt))}
${p(`<strong>${e(keep)}</strong>`)}
<p style="margin:24px 0 0;color:#5b6170;font-size:14px">Olhar Singular</p>
</div>
</body>
</html>
`;

  return { subject, html, text };
}

/**
 * Builds the confirmation and sends it. `async` on purpose: a builder failure
 * becomes a rejected promise for dispatchInBackground to absorb, never a
 * synchronous throw inside the checkout's response path. sendEmail itself
 * never rejects.
 */
export async function sendSubscriptionConfirmation(
  deps: EmailDeps,
  input: SubscriptionConfirmationInput & { to: string },
): Promise<SendEmailResult> {
  const { to, ...content } = input;
  const built = buildSubscriptionConfirmationEmail(content);
  return sendEmail(deps, { to, ...built, tags: [{ name: "type", value: "subscription_confirmation" }] });
}
