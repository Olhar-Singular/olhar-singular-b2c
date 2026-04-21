import { Link } from "react-router-dom";
import logoImg from "@/assets/logo-olho-transparent.png";

export default function LandingFooter() {
  return (
    <footer className="border-t border-border py-8 bg-background" role="contentinfo">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <Link to="/" className="flex items-center gap-2">
          <img src={logoImg} alt="Olhar Singular" className="h-10 w-auto" loading="lazy" />
          <span className="text-xs text-muted-foreground">© 2026 Olhar Singular</span>
        </Link>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground" aria-label="Links do rodapé">
          <Link to="/auth" className="hover:text-foreground transition-colors">Entrar</Link>
          <Link to="/auth?signup=1" className="hover:text-foreground transition-colors">Criar conta</Link>
        </nav>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4 px-4">
        Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.
      </p>
    </footer>
  );
}
