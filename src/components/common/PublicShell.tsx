import { Link } from "react-router-dom";
import { Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import logoImg from "@/assets/logo-olho-transparent.png";
import { CookiePreferencesButton } from "@/components/common/CookiePreferencesButton";

// Minimal chrome for public pages that are not the landing (legal): brand,
// "Entrar", and the legal footer. No marketing anchors, no sidebar. In
// `checkout` mode the header offers no way out of the payment screen (no
// home link, no "Entrar"), only the secure-payment note; the footer stays.
export default function PublicShell({ children, checkout = false }: { children: React.ReactNode; checkout?: boolean }) {
  const brand = (
    <>
      <img src={logoImg} alt="Olhar Singular" className="h-8 w-auto" loading="eager" />
      <span aria-hidden="true" className={`text-xs font-semibold tracking-widest uppercase ${checkout ? "text-primary-strong" : "text-primary"}`}>Olhar Singular</span>
    </>
  );
  const width = checkout ? "max-w-6xl" : "max-w-5xl";
  return (
    <div className={`min-h-screen flex flex-col bg-background${checkout ? " checkout-theme" : ""}`}>
      <header className="border-b border-border bg-card/90">
        <div className={`${width} mx-auto px-4 py-3 flex items-center justify-between`}>
          {checkout ? (
            <div className="flex items-center gap-2">{brand}</div>
          ) : (
            <Link to="/" className="flex items-center gap-2">
              {brand}
            </Link>
          )}
          {checkout ? (
            <p className="flex items-center gap-1.5 text-sm text-muted-foreground">
              <Lock className="h-4 w-4" aria-hidden="true" />
              Pagamento seguro · Mercado Pago
            </p>
          ) : (
            <Link to="/auth">
              <Button variant="ghost" size="sm">Entrar</Button>
            </Link>
          )}
        </div>
      </header>
      <main id="main-content" role="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border py-6 text-xs text-muted-foreground">
        <div className={`${width} mx-auto px-4 flex flex-wrap items-center justify-between gap-2`}>
          <span>Ferramenta pedagógica. Não realiza diagnóstico.</span>
          <nav aria-label="Legal" className="flex gap-4">
            <Link to="/termos" className="hover:text-foreground">Termos de Uso</Link>
            <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link to="/reembolso" className="hover:text-foreground">Reembolso</Link>
            <CookiePreferencesButton className="hover:text-foreground" />
          </nav>
        </div>
      </footer>
    </div>
  );
}
