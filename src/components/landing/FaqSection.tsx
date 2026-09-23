import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import { usePlans, type PlanView } from "@/hooks/useSubscription";
import { cheapestPublicPlan, formatBrl, publicPlans } from "@/lib/domain/subscriptionUi";

// publicPlans() always falls back to DEFAULT_PLANS (all non-admin-only) when the
// catalogue is empty, so cheapestPublicPlan() over that result is never null here.
function buildFaq(trialPlan: PlanView) {
  const priceLabel = formatBrl(trialPlan.priceBrl);
  const planName = trialPlan.name;
  const monthlyCredits = trialPlan.monthlyCredits;

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
      a: "Uma adaptação custa de 5 a 12 créditos, conforme a complexidade das barreiras. Extrair questões de uma prova custa 5. Iniciar uma conversa com a ISA custa 3 créditos, e as mensagens seguintes na mesma conversa não debitam.",
    },
    {
      q: "Os créditos expiram?",
      a: "Os créditos do plano renovam todo mês: o saldo do mês é substituído pela cota do plano na renovação. Os créditos extras, comprados avulsos, não expiram.",
    },
    {
      q: "Como funciona a assinatura?",
      a: "Você escolhe um plano mensal e paga no cartão de crédito, em 1x. Todo mês, na mesma data, a cobrança se repete e seus créditos do plano são renovados. Precisa de mais créditos num mês? Compre créditos extras avulsos, por Pix ou cartão, que não expiram.",
    },
    {
      q: "Como funciona o teste grátis de 7 dias?",
      a: `Você informa nome, e-mail e um cartão de crédito. O cartão é validado (uma cobrança simbólica pode aparecer e é estornada), nada é cobrado por 7 dias e você recebe 50 créditos para experimentar tudo. No 8º dia cobramos ${priceLabel} e sua conta vira o plano ${planName}, com ${monthlyCredits} créditos por mês. Cancelou antes do 8º dia? Nada é cobrado e o acesso encerra na hora. É um teste por CPF.`,
    },
    {
      q: "Posso cancelar quando quiser?",
      a: "Sim, em Créditos, com um clique. Você não é mais cobrado e continua usando os créditos do plano até o fim do período já pago. Os extras continuam com você. Durante o teste grátis, cancelar encerra o acesso na hora e nada é cobrado.",
    },
    {
      q: "Como troco de plano?",
      a: "Cancele o plano atual e assine o novo. Os créditos do plano novo substituem os do antigo, então o melhor momento é perto da renovação.",
    },
    {
      q: "E se eu me arrepender?",
      a: "Em Créditos você pede o estorno integral da última cobrança com um clique, a qualquer momento enquanto a assinatura estiver ativa (ou até 30 dias depois de cancelar). Os créditos restantes do plano daquele mês são removidos, os extras ficam, e a assinatura é cancelada. O dinheiro volta no mesmo cartão em até duas faturas.",
    },
    {
      q: "A ferramenta substitui o professor?",
      a: "Nunca. Você é sempre o decisor final. Pode ajustar, ignorar ou complementar qualquer sugestão da IA.",
    },
  ];
}

function FaqItem({ q, a, index }: { q: string; a: string; index: number }) {
  const [open, setOpen] = useState(false);
  const panelId = `faq-panel-${index}`;
  return (
    <div className="bg-card rounded-xl border border-border shadow-card overflow-hidden">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="w-full flex items-center justify-between px-6 py-4 text-left"
        aria-expanded={open}
        aria-controls={panelId}
      >
        <span className="font-semibold text-foreground text-sm">{q}</span>
        <ChevronDown
          className={`w-4 h-4 text-muted-foreground shrink-0 transition-transform ${open ? "rotate-180" : ""}`}
          aria-hidden="true"
        />
      </button>
      {open && (
        <div id={panelId} className="px-6 pb-4 text-sm text-muted-foreground leading-relaxed">{a}</div>
      )}
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
    <section id="faq" className="py-16 lg:py-24 bg-secondary/30">
      <div className="max-w-3xl mx-auto px-4">
        <div className="text-center mb-12">
          <h2 className="text-3xl font-bold text-foreground mb-3">Perguntas frequentes</h2>
        </div>
        <div className="space-y-3">
          {faq.map((item, i) => (
            <FaqItem key={item.q} index={i} q={item.q} a={item.a} />
          ))}
        </div>
      </div>
    </section>
  );
}
