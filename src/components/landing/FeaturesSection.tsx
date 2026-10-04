import provaImpressa from "@/assets/landing/prova-impressa.webp";
import perfisCelular from "@/assets/landing/perfis-celular.webp";
import historico from "@/assets/landing/historico.webp";
import justificativa from "@/assets/landing/justificativa.webp";

// All four thumbnails share the same 680x457 size (measured when converted to WebP).
const THUMB_WIDTH = 680;
const THUMB_HEIGHT = 457;

const FEATURES = [
  {
    title: "Prova adaptada pronta para imprimir",
    desc: "Revise a atividade na própria folha e exporte o documento formatado para levar à sala.",
    src: provaImpressa,
    alt: "Prova impressa sobre uma carteira de madeira, com três questões ilustradas por ícones e um lápis verde ao lado",
  },
  {
    title: "Perfis de barreira salvos",
    desc: "Registre as barreiras que você observa, sem identificar o aluno, e reutilize o perfil em toda atividade seguinte.",
    src: perfisCelular,
    alt: "Mão segurando um celular com cartões coloridos de perfis, com uma sala de aula desfocada ao fundo",
  },
  {
    title: "Suas adaptações guardadas",
    desc: "O que você adaptou fica salvo na sua conta, pronto para reabrir e reaproveitar no próximo bimestre.",
    src: historico,
    alt: "Pasta sanfonada verde-água cheia de atividades organizadas sobre uma mesa de sala de aula, com potes de canetas e uma planta",
  },
  {
    title: "Justificativa pedagógica de cada adaptação",
    desc: "A IA registra o motivo das mudanças feitas na atividade, para você consultar e levar à coordenação.",
    src: justificativa,
    alt: "Duas professoras conversando à mesa, uma delas sorrindo, com uma pasta e papéis à frente",
  },
];

export default function FeaturesSection() {
  return (
    <section aria-labelledby="h-recebe" className="px-5 py-10 sm:py-16 lg:py-20">
      <div className="mx-auto max-w-[1160px]">
        <h2
          id="h-recebe"
          className="text-pretty text-center font-poppins text-[clamp(26px,4.4vw,38px)] text-lp-ink"
        >
          Tudo que você recebe
        </h2>
        <ul
          role="list"
          className="mt-8 grid list-none grid-cols-[repeat(auto-fit,minmax(min(250px,100%),1fr))] gap-6 p-0"
        >
          {FEATURES.map((feature) => (
            <li
              key={feature.title}
              className="flex flex-col overflow-hidden rounded-2xl border border-lp-border bg-lp-surface shadow-[0_6px_20px_rgba(22,40,43,0.05)]"
            >
              <img
                src={feature.src}
                alt={feature.alt}
                width={THUMB_WIDTH}
                height={THUMB_HEIGHT}
                loading="lazy"
                decoding="async"
                className="aspect-[680/457] w-full object-cover"
              />
              <div className="px-5 pb-6 pt-4">
                <h3 className="text-pretty font-poppins text-lg text-lp-ink">{feature.title}</h3>
                <p className="mt-2 text-[15px] text-lp-ink-2">{feature.desc}</p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
