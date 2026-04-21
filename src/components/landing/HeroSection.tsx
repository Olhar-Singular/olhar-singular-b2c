import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

export default function HeroSection() {
  return (
    <section className="pt-24 relative overflow-hidden">
      <div className="gradient-hero">
        <div className="max-w-4xl mx-auto px-4 py-20 lg:py-28 text-center relative z-10">
          <Badge variant="secondary" className="mb-6 text-xs font-medium">
            10 créditos grátis ao cadastrar — sem cartão
          </Badge>
          <h1 className="text-4xl sm:text-5xl lg:text-[3.25rem] font-extrabold text-primary-foreground leading-tight mb-5">
            Adapte atividades para qualquer barreira de aprendizagem — em minutos
          </h1>
          <p className="text-lg text-primary-foreground/80 leading-relaxed mb-8 max-w-2xl mx-auto">
            Ferramenta de IA pedagógica para professores que querem incluir de verdade.
            Sem diagnóstico, sem laudo — foco nas barreiras observáveis em sala.
          </p>
          <div className="flex flex-col sm:flex-row gap-3 justify-center">
            <Link to="/auth?signup=1">
              <Button size="lg" className="bg-white text-primary hover:bg-white/90 font-semibold gap-2 w-full sm:w-auto">
                Começar grátis
                <ArrowRight className="w-4 h-4" aria-hidden="true" />
              </Button>
            </Link>
            <a href="#como-funciona">
              <Button size="lg" variant="outline" className="border-white/40 text-primary-foreground hover:bg-white/10 w-full sm:w-auto">
                Ver como funciona
              </Button>
            </a>
          </div>
        </div>
        <svg className="w-full block" viewBox="0 0 1440 60" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0,30 C360,70 1080,0 1440,30 L1440,60 L0,60 Z" fill="hsl(var(--background))" />
        </svg>
      </div>
    </section>
  );
}
