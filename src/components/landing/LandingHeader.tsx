import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";

export default function LandingHeader() {
  return (
    <header className="fixed top-0 left-0 right-0 z-50 bg-card/90 backdrop-blur-md border-b border-border">
      <div className="max-w-6xl mx-auto px-4 py-3 flex items-center justify-between">
        <Link to="/" className="text-sm font-bold text-primary tracking-widest uppercase">
          Olhar Singular
        </Link>
        <nav className="hidden sm:flex items-center gap-6" aria-label="Navegação principal">
          <a href="#como-funciona" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Como funciona</a>
          <a href="#precos" className="text-sm text-muted-foreground hover:text-foreground transition-colors">Preços</a>
          <a href="#faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">FAQ</a>
        </nav>
        <div className="flex items-center gap-2">
          <Link to="/auth">
            <Button variant="ghost" size="sm">Entrar</Button>
          </Link>
          <Link to="/auth?signup=1">
            <Button size="sm">Começar grátis</Button>
          </Link>
        </div>
      </div>
    </header>
  );
}
