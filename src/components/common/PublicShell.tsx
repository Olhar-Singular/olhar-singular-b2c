import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import logoImg from "@/assets/logo-olho-transparent.png";

// Minimal chrome for public pages that are not the landing (checkout, legal):
// brand, "Entrar", and the legal footer. No marketing anchors, no sidebar.
export default function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="border-b border-border bg-card/90">
        <div className="max-w-5xl mx-auto px-4 py-3 flex items-center justify-between">
          <Link to="/" className="flex items-center gap-2">
            <img src={logoImg} alt="Olhar Singular" className="h-8 w-auto" loading="eager" />
            <span className="text-xs font-semibold text-primary tracking-widest uppercase">Olhar Singular</span>
          </Link>
          <Link to="/auth">
            <Button variant="ghost" size="sm">Entrar</Button>
          </Link>
        </div>
      </header>
      <main id="main-content" role="main" className="flex-1">
        {children}
      </main>
      <footer className="border-t border-border py-6 text-xs text-muted-foreground">
        <div className="max-w-5xl mx-auto px-4 flex flex-wrap items-center justify-between gap-2">
          <span>Ferramenta pedagógica. Não realiza diagnóstico.</span>
          <nav aria-label="Legal" className="flex gap-4">
            <Link to="/termos" className="hover:text-foreground">Termos de Uso</Link>
            <Link to="/privacidade" className="hover:text-foreground">Privacidade</Link>
            <Link to="/reembolso" className="hover:text-foreground">Reembolso</Link>
          </nav>
        </div>
      </footer>
    </div>
  );
}
