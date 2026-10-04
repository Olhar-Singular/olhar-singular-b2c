import { MAX_ACTIVITY_CHARS } from "@/lib/domain/activityLimits";
import { EXTRACTION_COST } from "@/lib/domain/extractionCost";
import { ADAPTATION_COST_LABEL } from "@/lib/domain/subscriptionUi";

// Same order as the real wizard (Tipo, Atividade, Barreiras, Gerar, Revisar, Exportar).
// Credit figures come from the domain constants (adaptation cost by barrier, reading an uploaded exam).
const STEPS = [
  {
    title: "Escolha o tipo",
    text: "Prova, exercício, texto ou projeto: diga o que você vai adaptar.",
  },
  {
    title: "Traga a atividade",
    text: `Cole o texto (até ${MAX_ACTIVITY_CHARS.toLocaleString("pt-BR")} caracteres) ou envie um PDF ou Word. Ler a prova enviada custa ${EXTRACTION_COST} créditos.`,
  },
  {
    title: "Marque as barreiras",
    text: "Selecione o que você já observa em sala. Sem diagnóstico e sem laudo.",
  },
  {
    title: "Gere a adaptação",
    text: `A IA monta a versão adaptada. Cada adaptação custa ${ADAPTATION_COST_LABEL} créditos conforme a barreira.`,
  },
  {
    title: "Revise na folha",
    text: "A atividade aparece como ela será impressa: clique no texto e edite o que quiser. A justificativa pedagógica vem junto.",
  },
  {
    title: "Exporte",
    text: "Baixe o documento em PDF ou Word, pronto para levar para a sala.",
  },
];

export default function HowItWorksSection() {
  return (
    <section
      id="como-funciona"
      aria-labelledby="h-como"
      className="scroll-mt-20 border-y border-lp-border bg-lp-surface px-5 py-[clamp(40px,6vw,80px)]"
    >
      <div className="mx-auto max-w-[1160px]">
        <h2 id="h-como" className="text-pretty text-center font-poppins text-[clamp(26px,4.4vw,38px)]">
          Como funciona
        </h2>
        <p className="mx-auto mt-3.5 max-w-[620px] text-center text-lp-ink-2">
          Seis passos, do tipo de atividade ao documento pronto para imprimir.
        </p>
        <ol
          role="list"
          className="mt-8 grid list-none grid-cols-[repeat(auto-fit,minmax(min(320px,100%),1fr))] gap-6 p-0"
        >
          {STEPS.map((step, i) => (
            <li key={step.title} className="flex flex-col gap-3.5 rounded-2xl border border-lp-border bg-lp-bg p-[22px]">
              <span
                aria-hidden="true"
                className="flex h-[46px] w-[46px] items-center justify-center rounded-[14px] bg-lp-teal-deep font-poppins text-[15px] font-bold text-white"
              >
                {String(i + 1).padStart(2, "0")}
              </span>
              <h3 className="text-pretty font-poppins text-xl">{step.title}</h3>
              <p className="text-base text-lp-ink-2">{step.text}</p>
            </li>
          ))}
        </ol>
      </div>
    </section>
  );
}
