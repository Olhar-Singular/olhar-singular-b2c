import turmaDiversa from "@/assets/landing/turma-diversa.webp";

const PAINS = [
  {
    title: "O domingo virou dia de adaptar material",
    text: "Você reescreve prova à mão, no fim de semana, depois de uma semana inteira em sala. E na segunda começa tudo de novo.",
  },
  {
    title: "Com aquele aluno, você não sabe por onde começar",
    text: "Você percebe as barreiras, mas ninguém te ensinou quais mudanças fazem diferença para cada uma delas.",
  },
  {
    title: "A sensação de estar deixando alguém para trás",
    text: "A aula acontece, a turma avança e fica aquele incômodo: um aluno ficou de fora outra vez. Não por falta de cuidado seu.",
  },
];

export default function PainSection() {
  return (
    <section aria-labelledby="h-dor" className="px-5 py-[clamp(40px,6vw,80px)]">
      <div className="mx-auto grid max-w-[1160px] grid-cols-[repeat(auto-fit,minmax(min(300px,100%),1fr))] items-center gap-[clamp(24px,4vw,48px)]">
        <img
          src={turmaDiversa}
          alt="Professora ajudando alunos em uma sala de aula diversa e inclusiva"
          width={1040}
          height={784}
          loading="lazy"
          decoding="async"
          className="h-auto w-full rounded-2xl border border-lp-border"
        />
        <div>
          <h2
            id="h-dor"
            className="font-poppins text-pretty text-[clamp(26px,4.4vw,38px)] text-lp-ink"
          >
            Você reconhece isso?
          </h2>
          <ul role="list" className="mt-[22px] flex list-none flex-col gap-3.5 p-0">
            {PAINS.map((pain) => (
              <li
                key={pain.title}
                className="rounded-2xl border border-lp-border bg-lp-surface px-[22px] py-5 shadow-[0_6px_18px_rgba(22,40,43,0.05)]"
              >
                <h3 className="font-poppins text-pretty text-[19px] text-lp-ink">{pain.title}</h3>
                <p className="mt-2 text-base text-lp-ink-2">{pain.text}</p>
              </li>
            ))}
          </ul>
          <p className="mt-5 text-base text-lp-ink-2">
            Nada disso é falta de competência sua. É falta de tempo e de apoio, e é exatamente aí
            que o Olhar Singular entra.
          </p>
        </div>
      </div>
    </section>
  );
}
