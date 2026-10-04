import { useEffect, useMemo, type ReactNode } from "react";
import LandingCta from "@/components/landing/LandingCta";
import { usePackages } from "@/hooks/useCredits";
import { usePlans } from "@/hooks/useSubscription";
import {
  ADAPTATION_COST_LABEL,
  adaptationsRange,
  cheapestPublicPlan,
  EXTRAS_REFUND_DAYS,
  formatBrl,
  publicPackages,
  publicPlans,
  REFUND_WINDOW_DAYS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
} from "@/lib/domain/subscriptionUi";
import { trackSelectPlan, trackViewPlans } from "@/lib/analytics/events";

const CARD = "flex flex-col gap-3 rounded-2xl border p-6";
const CARD_PLAIN = `${CARD} border-lp-border bg-lp-bg shadow-[0_6px_18px_rgba(22,40,43,0.05)]`;
const CARD_HIGHLIGHT = `${CARD} relative border-2 border-lp-teal bg-lp-surface shadow-[0_16px_40px_rgba(15,181,160,0.22)]`;
const CARD_LABEL = "font-poppins text-[15px] font-semibold uppercase tracking-[0.06em] text-lp-muted";
const CARD_PRICE = "font-poppins text-3xl font-bold tracking-[-0.02em] text-lp-ink";
// Layout of the CTA at the foot of a card; colors come from the variant.
const CARD_CTA = "mt-auto min-h-[48px] w-full";
// The ghost variant dressed as an outlined button: the secondary action of the plans.
const CARD_CTA_OUTLINE =
  "rounded-2xl border-2 border-lp-teal-deep bg-lp-surface px-6 py-3 hover:bg-lp-teal-tint hover:no-underline";

function Bullet({ children }: { children: ReactNode }) {
  return (
    <li className="flex items-start gap-2.5 text-[15px] text-lp-ink-2">
      <span className="mt-2 h-2 w-2 flex-none rounded-[3px] bg-lp-teal" aria-hidden="true" />
      <span>{children}</span>
    </li>
  );
}

export default function PricingSection() {
  const { data, isPending } = usePlans();
  const { data: packageRows } = usePackages();
  // Memoized: publicPlans allocates, and the effect below keys on identity.
  const plans = useMemo(() => publicPlans(data), [data]);
  const trialPlan = useMemo(() => cheapestPublicPlan(plans), [plans]);
  const extras = useMemo(() => publicPackages(packageRows), [packageRows]);

  // Once per settled catalogue: while the query is pending the list on screen is only the
  // fallback, and reporting it would double-fire as soon as the real one lands. An errored
  // query is not pending, so the fallback it keeps showing is reported once.
  useEffect(() => {
    if (!isPending) trackViewPlans(plans);
  }, [plans, isPending]);

  return (
    <section
      id="precos"
      aria-labelledby="h-planos"
      className="scroll-mt-20 border-t border-lp-border bg-lp-surface px-5 py-[clamp(40px,6vw,80px)]"
    >
      <div className="mx-auto max-w-[1160px]">
        <h2
          id="h-planos"
          className="text-pretty text-center font-poppins text-[length:clamp(26px,4.4vw,38px)] text-lp-ink"
        >
          Planos e preços
        </h2>
        <p className="mx-auto mt-3.5 max-w-[620px] text-center text-lp-ink-2">
          Comece pelo teste de {TRIAL_DAYS} dias. Se fizer sentido, escolha o plano mensal que cabe na sua rotina.
        </p>

        <div className="mt-8 grid grid-cols-[repeat(auto-fit,minmax(min(230px,100%),1fr))] items-stretch gap-5">
          {/* Trial with card: always first, runs on the cheapest public plan. */}
          <article className={CARD_PLAIN}>
            <h3 className={CARD_LABEL}>Teste grátis {TRIAL_DAYS} dias</h3>
            <p className={CARD_PRICE}>{TRIAL_CREDITS} créditos</p>
            {trialPlan && (
              <p className="text-sm font-semibold text-lp-teal-text">
                Depois, {formatBrl(trialPlan.priceBrl)}/mês ({trialPlan.monthlyCredits} créditos). Cancele antes e não
                paga nada.
              </p>
            )}
            <ul role="list" className="mt-1.5 flex list-none flex-col gap-2.5 p-0">
              <Bullet>Acesso a todas as funcionalidades</Bullet>
              <Bullet>
                Cartão obrigatório. Nada é cobrado por {TRIAL_DAYS} dias; a cobrança começa no {TRIAL_DAYS + 1}º dia.
              </Bullet>
            </ul>
            <LandingCta to="/assinar?trial=1" origem="planos" className={CARD_CTA}>
              Testar {TRIAL_DAYS} dias grátis
            </LandingCta>
          </article>

          {plans.map((plan) => (
            <article key={plan.id} className={plan.highlight ? CARD_HIGHLIGHT : CARD_PLAIN}>
              {plan.highlight && (
                <span className="absolute -top-3.5 left-6 rounded-full bg-lp-orange px-3 py-1.5 font-poppins text-xs font-bold uppercase tracking-wider text-lp-ink">
                  Popular
                </span>
              )}
              <h3 className={CARD_LABEL}>{plan.name}</h3>
              <p className={CARD_PRICE}>
                {formatBrl(plan.priceBrl)}
                <span className="text-base font-medium text-lp-muted">/mês</span>
              </p>
              <p className="text-sm font-semibold text-lp-teal-text">{adaptationsRange(plan.monthlyCredits)}</p>
              <ul role="list" className="mt-1.5 flex list-none flex-col gap-2.5 p-0">
                <Bullet>{plan.monthlyCredits} créditos por mês</Bullet>
                <Bullet>Créditos renovados todo mês</Bullet>
                <Bullet>Cartão de crédito, cancele quando quiser</Bullet>
              </ul>
              <LandingCta
                to={`/assinar?plano=${encodeURIComponent(plan.slug)}`}
                origem="planos"
                variant={plan.highlight ? "primary" : "ghost"}
                className={plan.highlight ? CARD_CTA : `${CARD_CTA} ${CARD_CTA_OUTLINE}`}
                onClick={() => trackSelectPlan(plan)}
              >
                Assinar{" "}
                {/* LandingCta has no aria-label prop, so the plan name rides along as screen-reader-only text. */}
                <span className="sr-only">plano {plan.name}</span>
              </LandingCta>
            </article>
          ))}
        </div>

        <div className="mt-6 flex flex-col gap-2 text-center text-[15px] text-lp-ink-2">
          <p>Cada adaptação custa {ADAPTATION_COST_LABEL} créditos conforme a barreira.</p>
          <p>Assinatura no cartão de crédito. Créditos extras por Pix ou cartão. Pagamentos via Mercado Pago.</p>
        </div>

        <div className="mt-8 rounded-2xl border border-lp-border bg-lp-bg p-6 text-center shadow-[0_6px_18px_rgba(22,40,43,0.05)]">
          <h3 id="h-extras" className="font-poppins text-lg text-lp-ink">
            Créditos extras avulsos
          </h3>
          <p className="mt-1.5 text-[15px] text-lp-ink-2">Precisa de mais créditos num mês? Compre só o que faltar.</p>
          <ul
            role="list"
            aria-labelledby="h-extras"
            className="mt-4 flex list-none flex-wrap justify-center gap-3 p-0"
          >
            {extras.map((pkg) => (
              <li
                key={pkg.id}
                className="rounded-xl border border-lp-border bg-lp-surface px-4 py-3 font-poppins font-semibold text-lp-ink"
              >
                {pkg.credits} créditos por {formatBrl(pkg.amountBrl)}
              </li>
            ))}
          </ul>
          <p className="mx-auto mt-4 max-w-[620px] text-[15px] text-lp-ink-2">
            Os créditos do plano renovam todo mês (o saldo do mês é substituído pela cota). Os créditos extras, comprados
            avulsos, não expiram.
          </p>
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-center gap-5 rounded-2xl border border-lp-border bg-lp-bg p-6 text-center">
          <span
            className="flex h-16 w-16 flex-none items-center justify-center rounded-full bg-gradient-to-br from-lp-teal to-lp-teal-deep"
            aria-hidden="true"
          >
            <span className="block h-5 w-5 rounded-md bg-white" />
          </span>
          <p className="max-w-[620px] text-base text-lp-ink">
            Estorno integral da última cobrança da assinatura, em um clique em Créditos, enquanto ativa ou até{" "}
            {REFUND_WINDOW_DAYS} dias depois de cancelar. Extras não usados: até {EXTRAS_REFUND_DAYS} dias, pelo suporte no
            menu da sua conta.
          </p>
        </div>
      </div>
    </section>
  );
}
