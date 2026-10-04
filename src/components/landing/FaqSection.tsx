import { useMemo, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { usePlans, type PlanView } from "@/hooks/useSubscription";
import { EXTRACTION_COST } from "@/lib/domain/extractionCost";
import {
  ADAPTATION_COST_LABEL,
  EXTRAS_REFUND_DAYS,
  REFUND_WINDOW_DAYS,
  TRIAL_CREDITS,
  TRIAL_DAYS,
  cheapestPublicPlan,
  formatBrl,
  publicPlans,
} from "@/lib/domain/subscriptionUi";
import { cn } from "@/lib/utils";

interface FaqEntry {
  q: string;
  a: ReactNode;
}

// publicPlans() always falls back to DEFAULT_PLANS (all non-admin-only) when the
// catalogue is empty, so cheapestPublicPlan() over that result is never null here.
function buildFaq(trialPlan: PlanView): FaqEntry[] {
  const priceLabel = formatBrl(trialPlan.priceBrl);
  const planName = trialPlan.name;
  const monthlyCredits = trialPlan.monthlyCredits;
  // The first charge lands the day after the trial ends.
  const firstChargeDay = TRIAL_DAYS + 1;

  return [
    {
      q: "O Olhar Singular faz diagnóstico?",
      a: "Não. A ferramenta trabalha exclusivamente com barreiras pedagógicas observáveis em sala de aula, sem qualquer diagnóstico clínico.",
    },
    {
      q: "Preciso de laudo para usar?",
      a: "Não. Você observa as dificuldades em sala e seleciona as barreiras. Nenhum documento clínico é necessário.",
    },
    {
      q: "Quanto vale 1 crédito?",
      a: `Cada adaptação custa ${ADAPTATION_COST_LABEL} créditos, conforme a barreira escolhida. Ler uma prova enviada (PDF ou DOCX) custa ${EXTRACTION_COST}. Cada conversa nova com a ISA custa 3 créditos, e as mensagens seguintes da mesma conversa não custam, até o limite de mensagens por conversa indicado na tela.`,
    },
    {
      q: "Os créditos expiram?",
      a: "Os créditos do plano renovam todo mês: o saldo do mês é substituído pela cota do plano na renovação. Os créditos extras, comprados avulsos, não expiram.",
    },
    {
      q: "Como funciona a assinatura?",
      a: "Você escolhe um plano mensal e paga no cartão de crédito, em 1x. Todo mês, na mesma data, a cobrança se repete e seus créditos do plano são renovados. Precisa de mais créditos num mês? Compre créditos extras avulsos, por Pix ou cartão, que não expiram. Os pagamentos são processados pelo Mercado Pago.",
    },
    {
      q: `Como funciona o teste grátis de ${TRIAL_DAYS} dias?`,
      a: `Você informa nome, e-mail e um cartão de crédito. O cartão é validado (uma cobrança simbólica pode aparecer e é estornada), nada é cobrado por ${TRIAL_DAYS} dias e você recebe ${TRIAL_CREDITS} créditos para experimentar tudo. No ${firstChargeDay}º dia cobramos ${priceLabel} e sua conta vira o plano ${planName}, com ${monthlyCredits} créditos por mês. Cancelou antes do ${firstChargeDay}º dia? Nada é cobrado e o acesso encerra na hora. É um teste por CPF.`,
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim, em Créditos, com um clique. Você não é mais cobrado e continua usando os créditos do plano até o fim do período já pago. Os extras continuam com você. No teste grátis, cancelando até o dia anterior ao da primeira cobrança, o acesso encerra na hora e nada é cobrado.",
    },
    {
      q: "Como troco de plano?",
      a: "Cancele o plano atual e assine o novo. Os créditos do plano novo substituem os do antigo, então o melhor momento é perto da renovação.",
    },
    {
      q: "E se eu me arrepender?",
      a: `Em Créditos você pede o estorno integral da última cobrança com um clique, a qualquer momento enquanto a assinatura estiver ativa (ou até ${REFUND_WINDOW_DAYS} dias depois de cancelar). Os créditos restantes do plano daquele mês são removidos, os extras ficam, e a assinatura é cancelada. O dinheiro volta no mesmo cartão em até duas faturas. Os créditos extras não usados podem ser reembolsados em até ${EXTRAS_REFUND_DAYS} dias após a compra, pelo suporte no menu da sua conta.`,
    },
    {
      q: "A ferramenta substitui o professor?",
      a: "Nunca. Você é sempre o decisor final. Pode ajustar, ignorar ou complementar qualquer sugestão da IA.",
    },
    {
      q: "Funciona no celular?",
      a: "Você acessa pelo navegador do celular, do tablet ou do computador, sem instalar nada.",
    },
    {
      q: "Posso colocar o nome do aluno?",
      a: (
        <>
          Não informe nome completo nem dados pessoais do aluno. Descreva só as barreiras que você observa em sala.
          Veja mais na{" "}
          <Link
            to="/privacidade"
            className="font-semibold text-lp-teal-text underline underline-offset-2 hover:text-lp-teal-hover"
          >
            Política de Privacidade
          </Link>
          .
        </>
      ),
    },
  ];
}

function FaqItem({ q, a, index }: FaqEntry & { index: number }) {
  const [open, setOpen] = useState(false);
  const buttonId = `faq-button-${index}`;
  const panelId = `faq-panel-${index}`;
  return (
    <div className="rounded-2xl border border-lp-border bg-lp-surface">
      <h3>
        <button
          type="button"
          id={buttonId}
          onClick={() => setOpen((v) => !v)}
          className="flex min-h-[56px] w-full items-center justify-between gap-4 rounded-2xl px-5 py-[18px] text-left font-poppins text-[17px] font-semibold text-lp-ink transition-colors hover:bg-lp-bg motion-reduce:transition-none"
          aria-expanded={open}
          aria-controls={panelId}
        >
          <span>{q}</span>
          <span
            aria-hidden="true"
            className={cn(
              "shrink-0 text-[26px] leading-none text-lp-teal-text transition-transform motion-reduce:transition-none",
              open && "rotate-45",
            )}
          >
            +
          </span>
        </button>
      </h3>
      <div id={panelId} aria-labelledby={buttonId} hidden={!open} className="px-5 pb-5">
        <p className="text-base text-lp-ink-2">{a}</p>
      </div>
    </div>
  );
}

export default function FaqSection() {
  const { data } = usePlans();
  const plans = useMemo(() => publicPlans(data), [data]);
  // publicPlans() never returns an empty, all-admin-only list (see buildFaq's comment).
  const trialPlan = useMemo(() => cheapestPublicPlan(plans)!, [plans]);
  const faq = useMemo(() => buildFaq(trialPlan), [trialPlan]);

  return (
    <section id="faq" aria-labelledby="h-faq" className="scroll-mt-20 px-5 py-[clamp(40px,6vw,80px)]">
      <div className="mx-auto max-w-[800px]">
        <h2 id="h-faq" className="text-pretty text-center font-poppins text-[clamp(26px,4.4vw,38px)] text-lp-ink">
          Perguntas frequentes
        </h2>
        <div className="mt-[30px] flex flex-col gap-3">
          {faq.map((item, i) => (
            <FaqItem key={item.q} index={i} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
