import LandingCta from "./LandingCta";
import turmaDiversa from "@/assets/landing/turma-diversa.webp";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

interface HeroSectionProps {
  /**
   * Optional presentation video. Must be self-hosted (same origin): the CSP
   * has no media-src and its frame-src allows no external video provider, so a
   * YouTube/Vimeo embed would be blocked. Without it the hero shows the photo.
   */
  videoUrl?: string;
}

// React 18 does not know the camelCase `fetchPriority` prop (React 19 does) and
// warns in dev, so the hint goes through as the lowercase HTML attribute.
const HIGH_PRIORITY = { fetchpriority: "high" };

const MEDIA_FRAME =
  "mx-auto mt-8 max-w-3xl overflow-hidden rounded-2xl bg-lp-dark shadow-[0_18px_50px_rgba(10,127,135,0.18)]";

export default function HeroSection({ videoUrl }: HeroSectionProps) {
  return (
    <section
      aria-labelledby="h-hero"
      className="bg-[radial-gradient(1200px_480px_at_50%_-160px,#E4F5F3,#F8FAFA)] px-5 pb-[clamp(32px,5vw,64px)] pt-[clamp(24px,5vw,56px)]"
    >
      <div className="mx-auto max-w-[900px] text-center">
        <p className="mb-5 inline-block rounded-full bg-lp-teal-tint px-4 py-2 text-sm font-semibold uppercase tracking-[0.04em] text-lp-teal-text">
          Olhar Singular
        </p>
        <h1
          id="h-hero"
          className="text-pretty font-poppins text-[length:clamp(30px,6.2vw,52px)] tracking-[-0.02em] text-lp-ink"
        >
          Sua aula é a mesma para 30 alunos. Mas nem todos aprendem do mesmo jeito.
        </h1>
        <p className="mx-auto mt-5 max-w-[700px] text-[length:clamp(17px,2.3vw,20px)] text-lp-ink-2">
          Adapte uma prova, um texto ou um exercício a partir das barreiras que você já observa em sala. Sem diagnóstico, sem laudo.
        </p>

        <div className="mt-7 flex flex-col items-center gap-3">
          <LandingCta
            to="/assinar?trial=1"
            origem="hero"
            className="min-h-[52px] px-8 py-4 text-[length:clamp(17px,2.4vw,21px)] shadow-[0_10px_26px_rgba(255,138,61,0.4)]"
          >
            Testar {TRIAL_DAYS} dias grátis
          </LandingCta>
          <p className="max-w-[560px] text-[15px] text-lp-ink-2">
            Cartão obrigatório. Nada é cobrado por {TRIAL_DAYS} dias; cancele antes do {TRIAL_DAYS + 1}º dia e não paga
            nada. {TRIAL_CREDITS} créditos para testar.
          </p>
          <a
            href="#como-funciona"
            className="inline-flex min-h-[44px] items-center px-2 font-poppins font-semibold text-lp-teal-text underline underline-offset-4 hover:text-lp-teal-hover motion-reduce:transition-none"
          >
            Ver como funciona
          </a>
        </div>

        <div className={MEDIA_FRAME}>
          {videoUrl ? (
            <video
              controls
              preload="none"
              poster={turmaDiversa}
              src={videoUrl}
              aria-label="Vídeo de apresentação do Olhar Singular"
              className="aspect-video w-full object-cover"
            />
          ) : (
            <img
              src={turmaDiversa}
              alt="Sala de aula com alunos diversos fazendo atividade, e uma professora agachada ajudando um menino"
              width={1040}
              height={784}
              loading="eager"
              {...HIGH_PRIORITY}
              decoding="async"
              className="h-auto w-full"
            />
          )}
        </div>
      </div>
    </section>
  );
}
