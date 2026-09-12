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
        <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground" aria-label="Links do rodapé">
          <Link to="/auth" className="hover:text-foreground transition-colors">Entrar</Link>
          <a href="#precos" className="hover:text-foreground transition-colors">Planos</a>
          <Link to="/termos" className="hover:text-foreground transition-colors">Termos de Uso</Link>
          <Link to="/privacidade" className="hover:text-foreground transition-colors">Privacidade</Link>
          <Link to="/reembolso" className="hover:text-foreground transition-colors">Reembolso</Link>
        </nav>
      </div>
      <p className="text-xs text-muted-foreground text-center mt-4 px-4">
        Ferramenta pedagógica. Não realiza diagnóstico. A decisão final é sempre do profissional.
      </p>
      <p className="text-xs text-muted-foreground text-center mt-2 px-4">
        Olhar Singular · CNPJ 00.000.000/0000-00 (a confirmar) · contato@olharsingular.com
      </p>
    </footer>
  );
}
