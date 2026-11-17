import { Check, Info, Lock, ShieldCheck } from "lucide-react";
import { formatBrl, formatDate, REFUND_WINDOW_DAYS, TRIAL_DAYS } from "@/lib/domain/subscriptionUi";
import { TESTIMONIALS } from "@/components/landing/testimonials";
import { prepaidSummary, type PrepaidPlanView } from "@/lib/domain/prepaid";
import type { PlanView } from "@/hooks/useSubscription";

type TrustColumnProps =
  | {
      mode?: "card";
      plan: PlanView;
      trial: boolean;
      /** First charge of a trial; null on a paid checkout (charged today). */
      firstCharge: Date | null;
    }
  | {
      /** Pix prepaid plan: one-off payment and the 7-day guarantee (R2). */
      mode: "pix";
      prepaid: PrepaidPlanView;
    };

/** Guarantee of the Pix prepaid plan, as the mockup and the Refund Policy state it. */
const PIX_GUARANTEE = "Se não servir para a sua realidade de sala, devolvemos o valor integral em até 7 dias. É só pedir pelo suporte.";

const BENEFITS = [
  "Provas e atividades adaptadas em minutos",
  "Justificativa pedagógica pronta para a coordenação",
  "Perfis de barreira salvos por aluno",
  "Chat com a ISA e histórico completo",
];

// Cláudia's quote speaks to the benefit the summary leads with (adapted tests + justification).
const TESTIMONIAL = TESTIMONIALS[0];

const CARD = "rounded-xl border border-border bg-card p-5";

// The right column of the checkout: what the decision rests on (summary,
// benefits, a real testimonial, the refund guarantee as the Refund Policy
// states it, and the seals). The guarantee text must follow the policy
// (card: clauses 2 and 3; Pix prepaid plan: its own section), never the
// agency's mockup alone.
export default function TrustColumn(props: TrustColumnProps) {
  return (
    <aside aria-label="Resumo e garantias" className="space-y-4">
      {props.mode === "pix" ? <PixSummary plan={props.prepaid} /> : <CardSummary {...props} />}

      <section aria-labelledby="benefits-heading" className={CARD}>
        <h2 id="benefits-heading" className="text-sm font-semibold text-foreground">O que você recebe</h2>
        <ul aria-label="O que você recebe" className="mt-3 space-y-2">
          {BENEFITS.map((item) => (
            <li key={item} className="flex gap-2 text-sm text-foreground">
              <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
              {item}
            </li>
          ))}
        </ul>
      </section>

      <figure className={CARD}>
        <blockquote className="text-sm text-foreground">“{TESTIMONIAL.quote}”</blockquote>
        <figcaption className="mt-2 text-xs text-muted-foreground">
          {TESTIMONIAL.name} · {TESTIMONIAL.detail}
        </figcaption>
      </figure>

      <section aria-labelledby="guarantee-heading" className={`${CARD} flex gap-3`}>
        <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <div>
          <h2 id="guarantee-heading" className="text-sm font-semibold text-foreground">
            {props.mode === "pix" ? "7 dias de garantia" : "Sem risco"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {props.mode === "pix" ? PIX_GUARANTEE : cardGuarantee(props.trial)}
          </p>
        </div>
      </section>

      <ul aria-label="Segurança" className={`${CARD} space-y-2 text-xs text-muted-foreground`}>
        <li className="flex gap-2">
          <Lock className="h-4 w-4 shrink-0" aria-hidden="true" />
          Pagamento processado pelo Mercado Pago
        </li>
        <li className="flex gap-2">
          <ShieldCheck className="h-4 w-4 shrink-0" aria-hidden="true" />
          Dados tratados conforme a LGPD
        </li>
        <li className="flex gap-2">
          <Info className="h-4 w-4 shrink-0" aria-hidden="true" />
          Não realiza diagnóstico. A decisão é sempre do professor.
        </li>
      </ul>
    </aside>
  );
}

function cardGuarantee(trial: boolean): string {
  const refund = `última cobrança pode ser estornada integralmente na área Créditos, enquanto a assinatura estiver ativa ou até ${REFUND_WINDOW_DAYS} dias após cancelar.`;
  return trial ? `Cancele antes do ${TRIAL_DAYS + 1}º dia e nada é cobrado. Depois, a ${refund}` : `A ${refund}`;
}

function CardSummary({ plan, trial, firstCharge }: { plan: PlanView; trial: boolean; firstCharge: Date | null }) {
  return (
    <section aria-labelledby="summary-heading" className={CARD}>
      <h2 id="summary-heading" className="text-sm font-semibold text-foreground">Resumo</h2>
      <p className="mt-3 flex justify-between gap-2 text-sm text-muted-foreground">
        <span>Plano {plan.name} · mensal</span>
        <span className="text-foreground">{formatBrl(plan.priceBrl)}/mês</span>
      </p>
      <p className="mt-3 flex items-baseline justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm font-medium text-foreground">Você paga hoje</span>
        <strong className="text-2xl font-bold tabular-nums text-primary">{formatBrl(trial ? 0 : plan.priceBrl)}</strong>
      </p>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">
        {trial && firstCharge
          ? `Primeira cobrança em ${formatDate(firstCharge)}, com aviso por e-mail 2 dias antes.`
          : "Renova todo mês na mesma data."}
      </p>
    </section>
  );
}

function PixSummary({ plan }: { plan: PrepaidPlanView }) {
  const summary = prepaidSummary(plan);
  return (
    <section aria-labelledby="summary-heading" className={CARD}>
      <h2 id="summary-heading" className="text-sm font-semibold text-foreground">Resumo</h2>
      <p className="mt-3 flex justify-between gap-2 text-sm text-muted-foreground">
        <span>{summary.access}</span>
        <span className="text-foreground">{summary.credits}</span>
      </p>
      <p className="mt-3 flex items-baseline justify-between gap-2 border-t border-border pt-3">
        <span className="text-sm font-medium text-foreground">Você paga hoje</span>
        <strong className="text-2xl font-bold tabular-nums text-primary">{summary.payToday}</strong>
      </p>
      <p className="mt-3 border-t border-border pt-3 text-xs text-muted-foreground">{summary.once}</p>
    </section>
  );
}
