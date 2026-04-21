import { Link } from "react-router-dom";

export default function LandingFooter() {
  return (
    <footer className="border-t border-border py-8 bg-background" role="contentinfo">
      <div className="max-w-6xl mx-auto px-4 flex flex-col md:flex-row items-center justify-between gap-4">
        <span className="text-sm font-bold text-primary tracking-widest uppercase">Olhar Singular</span>
        <nav className="flex items-center gap-6 text-sm text-muted-foreground" aria-label="Links do rodapé">
          <Link to="/auth" className="hover:text-foreground transition-colors">Entrar</Link>
          <Link to="/auth?signup=1" className="hover:text-foreground transition-colors">Criar conta</Link>
        </nav>
        <span className="text-xs text-muted-foreground">© 2026 Olhar Singular</span>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4 px-4">
        Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.
      </p>
    </footer>
  );
}
