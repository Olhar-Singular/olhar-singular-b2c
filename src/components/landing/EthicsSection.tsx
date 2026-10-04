import { Link } from "react-router-dom";

// Factual commitments only: each one maps to the terms of use or to what the
// product really does (inline editor, no diagnosis, no student identity).
const COMMITMENTS = [
  {
    title: "Não diagnostica e não exige laudo",
    text: "A ferramenta não diagnostica nem avalia o aluno, e nenhum documento médico é necessário. O ponto de partida são as barreiras que você observa em sala.",
  },
  {
    title: "Revise antes de usar",
    text: "O conteúdo gerado por IA pode conter erros. Revise tudo antes de levar a atividade para os alunos.",
  },
  {
    title: "Você decide o que entra no documento",
    text: "A IA sugere; quem decide é você. Edite direto na folha antes de exportar.",
  },
  {
    title: "Cuidado com os dados do aluno",
    text: "Não informe nome completo nem dados pessoais do aluno. O Olhar Singular trabalha com barreiras pedagógicas, não com identidades.",
    link: { to: "/privacidade", label: "Ler a Política de Privacidade" },
  },
];

export default function EthicsSection() {
  return (
    <section aria-labelledby="h-etica" className="px-5 py-10 sm:py-14 lg:py-20">
      <div className="mx-auto max-w-[1160px]">
        <h2
          id="h-etica"
          className="text-pretty text-center font-poppins text-[length:clamp(26px,4.4vw,38px)] text-lp-ink"
        >
          Ética e segurança
        </h2>
        <p className="mx-auto mt-3.5 max-w-[640px] text-center text-lp-ink-2">
          Inclusão é assunto sério. Por isso deixamos nossos limites bem claros, por escrito.
        </p>
        <ul
          role="list"
          className="mt-8 grid list-none grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] gap-5 p-0"
        >
          {COMMITMENTS.map((c) => (
            <li
              key={c.title}
              className="rounded-2xl border border-lp-border bg-lp-surface p-6 shadow-[0_6px_18px_rgba(22,40,43,0.05)]"
            >
              <span
                className="mb-3.5 flex h-10 w-10 items-center justify-center rounded-xl bg-lp-teal-tint"
                aria-hidden="true"
              >
                <span className="block h-3.5 w-3.5 rounded bg-gradient-to-br from-lp-teal to-lp-teal-deep" />
              </span>
              <h3 className="text-pretty font-poppins text-lg text-lp-ink">{c.title}</h3>
              <p className="mt-2 text-[15px] text-lp-ink-2">{c.text}</p>
              {c.link && (
                <Link
                  to={c.link.to}
                  className="mt-3 inline-flex min-h-[44px] items-center font-poppins font-semibold text-lp-teal-text underline underline-offset-4 hover:text-lp-teal-hover motion-reduce:transition-none"
                >
                  {c.link.label}
                </Link>
              )}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
