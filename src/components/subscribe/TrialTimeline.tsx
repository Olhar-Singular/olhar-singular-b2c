import { formatBrl, TRIAL_CREDITS } from "@/lib/domain/subscriptionUi";
import { formatDayMonth, trialTimeline, type TrialStep } from "@/lib/domain/checkoutCopy";
import type { PlanView } from "@/hooks/useSubscription";

// Today, the reminder and the first charge, dated from the visit (the server's
// trialEndsAt is the truth after the checkout). Never fixed dates.
export default function TrialTimeline({ start, plan }: { start: Date; plan: PlanView }) {
  const copy: Record<TrialStep["key"], { title: string; text: string }> = {
    today: { title: formatBrl(0), text: `Acesso liberado na hora, com ${TRIAL_CREDITS} créditos para testar.` },
    reminder: { title: "Aviso por e-mail", text: "Lembramos você 2 dias antes. Sem cobrança surpresa." },
    charge: { title: `${formatBrl(plan.priceBrl)}/mês`, text: "Só se você continuar. Cancele antes e não paga nada." },
  };
  return (
    <ol aria-label="Como funciona o teste" className="grid grid-cols-1 gap-3 rounded-xl border border-border bg-card p-4 sm:grid-cols-3 sm:gap-0 sm:divide-x sm:divide-border">
      {trialTimeline(start).map((step) => (
        <li key={step.key} className="flex gap-3 sm:block sm:px-4 sm:first:pl-0 sm:last:pr-0">
          <span
            aria-hidden="true"
            className={`mt-1.5 h-2 w-2 shrink-0 rounded-full sm:hidden ${step.key === "today" ? "bg-primary" : "bg-muted-foreground/40"}`}
          />
          <span className="block">
            <span className={`block text-xs font-semibold uppercase tracking-wider ${step.key === "today" ? "text-primary-strong" : "text-muted-foreground"}`}>
              {step.key === "today" ? "Hoje" : `${formatDayMonth(step.date)} · ${step.dayNumber}º dia`}
            </span>
            <span className="mt-0.5 block font-semibold text-foreground">{copy[step.key].title}</span>
            <span className="mt-0.5 block text-sm text-muted-foreground">{copy[step.key].text}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}
