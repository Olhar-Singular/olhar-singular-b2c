import LandingCta from "./LandingCta";
import logoImg from "@/assets/logo-olho-transparent.png";
import { TRIAL_CREDITS, TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

// Text and logo only: no photo, no people, no social proof (nothing fictitious goes live).
// The logo has black lashes on a transparent background, so it sits on a white chip over the dark band.
export default function FinalCtaSection() {
  return (
    <section
      aria-labelledby="h-fechamento"
      className="lp-on-dark bg-lp-dark px-5 py-[clamp(40px,6vw,88px)] text-white"
    >
      <div className="mx-auto flex max-w-[720px] flex-col items-center text-center">
        <span className="flex items-center gap-3">
          <img
            src={logoImg}
            alt="Olhar Singular"
            width={56}
            height={56}
            loading="lazy"
            decoding="async"
            className="h-14 w-14 rounded-full bg-white p-1.5"
          />
          <span aria-hidden="true" className="font-poppins text-lg font-semibold tracking-tight">
            Olhar Singular
          </span>
        </span>

        <h2
          id="h-fechamento"
          className="mt-6 text-pretty font-poppins text-[length:clamp(26px,4.4vw,38px)] text-white"
        >
          Pronto para adaptar a próxima atividade?
        </h2>
        <p className="mt-4 text-lg text-lp-teal-tint">
          Escolha o tipo de atividade, marque as barreiras do aluno e revise o resultado direto na folha antes de
          exportar.
        </p>

        <LandingCta
          to="/assinar?trial=1"
          origem="fechamento"
          variant="on-dark"
          className="mt-7 min-h-[52px] px-8 py-5 text-[length:clamp(17px,2.2vw,21px)] shadow-[0_10px_26px_rgba(15,181,160,0.35)]"
        >
          Testar {TRIAL_DAYS} dias grátis
        </LandingCta>

        <p className="mt-4 text-[15px] text-lp-teal-tint">Cartão obrigatório. Nada é cobrado por {TRIAL_DAYS} dias.</p>
        <p className="mt-1 text-[15px] text-lp-teal-tint">
          Cancele antes do {TRIAL_DAYS + 1}º dia e não paga nada. {TRIAL_CREDITS} créditos para testar.
        </p>
      </div>
    </section>
  );
}
