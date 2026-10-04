import { Link } from "react-router-dom";
import LandingCta from "./LandingCta";
import logoImg from "@/assets/logo-olho-transparent.png";
import { TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

const NAV_LINKS = [
  { href: "#como-funciona", label: "Como funciona" },
  { href: "#precos", label: "Preços" },
  { href: "#faq", label: "FAQ" },
] as const;

const NAV_LINK_CLASS =
  "inline-flex min-h-[44px] items-center whitespace-nowrap px-2 text-[15px] font-medium text-lp-ink-2 transition-colors hover:text-lp-teal-text motion-reduce:transition-none";

// Sticky (not fixed) so the page needs no top padding hack. One row at every width: 69px = py-3 + the
// 44px touch target + the 1px border. Anchor targets use scroll-mt-20 (80px), so the header must never wrap.
export default function LandingHeader() {
  return (
    <header className="sticky top-0 z-40 border-b border-lp-border bg-[rgba(248,250,250,0.94)] backdrop-blur-md">
      <div className="mx-auto flex max-w-[1160px] items-center justify-between gap-4 px-5 py-3">
        <Link
          to="/"
          aria-label="Olhar Singular: página inicial"
          className="flex min-h-[44px] items-center gap-2.5 text-lp-ink"
        >
          <img src={logoImg} alt="Olhar Singular" width={32} height={32} className="h-8 w-8" loading="eager" />
          <span className="whitespace-nowrap font-poppins text-[17px] font-semibold tracking-tight max-[430px]:sr-only">
            Olhar Singular
          </span>
        </Link>

        <nav className="hidden items-center gap-3 min-[820px]:flex" aria-label="Navegação principal">
          {NAV_LINKS.map(({ href, label }) => (
            <a key={href} href={href} className={NAV_LINK_CLASS}>
              {label}
            </a>
          ))}
        </nav>

        <div className="flex items-center gap-2 sm:gap-4">
          <Link to="/auth" className={NAV_LINK_CLASS}>
            Entrar
          </Link>
          <LandingCta to="/assinar?trial=1" origem="header" className="px-4 py-2.5 text-[15px] sm:px-5">
            <span className="whitespace-nowrap sm:hidden">Testar grátis</span>
            <span className="hidden whitespace-nowrap sm:inline">Testar {TRIAL_DAYS} dias grátis</span>
          </LandingCta>
        </div>
      </div>
    </header>
  );
}
