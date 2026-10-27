// PLACEHOLDER COPY (2026-10-19). These three quotes were written for layout review on the
// preview build; nobody here is a real customer and no name belongs to a real person. Swap
// them for real, authorized testimonials (quote, name, consent) before this section ships
// to production. Avatars are initials on purpose: no generated face stands in for a person.
const PLACEHOLDER_TESTIMONIALS = [
  {
    quote:
      "Eu passava o domingo reescrevendo prova. Agora adapto em quinze minutos e ainda levo a justificativa pronta para a coordenação.",
    name: "Cláudia M.",
    detail: "Português · Belo Horizonte (MG)",
  },
  {
    quote:
      "Tenho 34 alunos e três com barreiras bem diferentes. Pela primeira vez consegui atender os três na mesma semana.",
    name: "Renato A.",
    detail: "Matemática · Campinas (SP)",
  },
  {
    quote:
      "No AEE, o que mais me ajudou foi o perfil salvo por aluno. Não preciso explicar tudo de novo a cada atividade.",
    name: "Joana V.",
    detail: "AEE · Recife (PE)",
  },
];

function initials(name: string): string {
  return name
    .split(" ")
    .map((part) => part.charAt(0))
    .join("")
    .toUpperCase();
}

export default function TestimonialsSection() {
  return (
    <section
      aria-labelledby="h-depoimentos"
      className="border-b border-lp-border bg-lp-surface px-5 py-[clamp(40px,6vw,80px)]"
    >
      <div className="mx-auto max-w-[1160px]">
        <h2
          id="h-depoimentos"
          className="font-poppins text-pretty text-center text-[clamp(26px,4.4vw,38px)] text-lp-ink"
        >
          Quem já usa conta assim
        </h2>
        <ul
          role="list"
          className="m-0 mt-8 grid list-none grid-cols-[repeat(auto-fit,minmax(min(280px,100%),1fr))] gap-[22px] p-0"
        >
          {PLACEHOLDER_TESTIMONIALS.map((t) => (
            <li key={t.name} className="flex">
              <figure className="m-0 flex w-full flex-col gap-4 rounded-2xl border border-lp-border bg-lp-bg p-6">
                <blockquote className="m-0 text-[17px] leading-relaxed text-lp-ink">{t.quote}</blockquote>
                <figcaption className="mt-auto flex items-center gap-3.5">
                  <span
                    aria-hidden="true"
                    data-testid="testimonial-avatar"
                    className="flex h-14 w-14 flex-none items-center justify-center rounded-full bg-gradient-to-br from-lp-teal-deep to-lp-teal-text font-poppins text-base font-semibold text-white"
                  >
                    {initials(t.name)}
                  </span>
                  <span>
                    <span data-testid="testimonial-name" className="block font-poppins font-semibold text-lp-ink">
                      {t.name}
                    </span>
                    <span data-testid="testimonial-detail" className="block text-sm text-lp-muted">
                      {t.detail}
                    </span>
                  </span>
                </figcaption>
              </figure>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
