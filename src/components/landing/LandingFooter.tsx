import { Link } from "react-router-dom";
import logoImg from "@/assets/logo-olho-transparent.png";
import { CookiePreferencesButton } from "@/components/common/CookiePreferencesButton";

const LINK_CLASS =
  "inline-flex min-h-[44px] items-center text-[15px] text-lp-ink-2 underline-offset-4 transition-colors hover:text-lp-teal-text hover:underline motion-reduce:transition-none";

// The bottom padding clears the fixed MobileCtaBar (below 760px) so it never hides the last paragraph.
export default function LandingFooter() {
  return (
    <footer className="border-t border-lp-border bg-lp-bg px-5 pt-10 pb-[calc(6.5rem+env(safe-area-inset-bottom))] min-[760px]:pb-10">
      <div className="mx-auto grid max-w-[1160px] grid-cols-[repeat(auto-fit,minmax(min(240px,100%),1fr))] items-start gap-6">
        <div>
          <Link
            to="/"
            aria-label="Olhar Singular: página inicial"
            className="inline-flex min-h-[44px] items-center gap-2.5 text-lp-ink"
          >
            <img src={logoImg} alt="Olhar Singular" width={32} height={32} className="h-8 w-8" loading="lazy" decoding="async" />
            <span className="font-poppins font-semibold">Olhar Singular</span>
          </Link>
          <p className="mt-3 text-sm text-lp-muted">CNPJ 66.792.955/0001-37</p>
        </div>

        <nav aria-label="Links institucionais" className="flex flex-col gap-1">
          <Link to="/auth" className={LINK_CLASS}>
            Entrar
          </Link>
          <a href="#precos" className={LINK_CLASS}>
            Planos
          </a>
          <Link to="/termos" className={LINK_CLASS}>
            Termos de Uso
          </Link>
          <Link to="/privacidade" className={LINK_CLASS}>
            Privacidade
          </Link>
          <Link to="/reembolso" className={LINK_CLASS}>
            Reembolso
          </Link>
          <CookiePreferencesButton className={LINK_CLASS} />
        </nav>

        <p className="max-w-[420px] text-sm text-lp-muted">
          Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.
        </p>
      </div>
    </footer>
  );
}
