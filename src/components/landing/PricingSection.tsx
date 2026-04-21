import { Link } from "react-router-dom";
import { CheckCircle2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";

const PACKAGES = [
  { label: "Básico",        credits: 30,  price: "R$ 9,90",  perCredit: "~10 adaptações",  highlight: false },
  { label: "Profissional",  credits: 120, price: "R$ 29,90", perCredit: "~40 adaptações",  highlight: true  },
  { label: "Avançado",      credits: 300, price: "R$ 59,90", perCredit: "~100 adaptações", highlight: false },
];

export default function PricingSection() {
  return (
    <section id="precos" className="py-16 lg:py-24 bg-background">
      <div className="max-w-5xl mx-auto px-4">
        <div className="text-center mb-14">
          <h2 className="text-3xl font-bold text-foreground mb-3">Planos e preços</h2>
          <p className="text-muted-foreground max-w-lg mx-auto">
            Comece grátis. Compre créditos quando precisar. Créditos nunca expiram.
          </p>
        </div>

        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-6 items-stretch">
          {/* Free tier */}
          <div className="bg-card rounded-xl border border-border shadow-card p-6 flex flex-col">
            <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide mb-1">Para conhecer</p>
            <p className="text-2xl font-extrabold text-foreground mb-1">Grátis</p>
            <p className="text-sm text-muted-foreground mb-4">Sempre</p>
            <ul className="space-y-2 text-sm text-foreground flex-1 mb-6">
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                10 créditos grátis ao cadastrar
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                1 adaptação completa sem custo
              </li>
              <li className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-primary shrink-0" aria-hidden="true" />
                Acesso a todas as funcionalidades
              </li>
            </ul>
            <Link to="/auth?signup=1">
              <Button variant="outline" className="w-full">Começar grátis</Button>
            </Link>
          </div>

          {/* Paid packages */}
          {PACKAGES.map((pkg) => (
            <div
              key={pkg.credits}
              className={`rounded-xl border p-6 flex flex-col ${
                pkg.highlight
                  ? "bg-primary text-primary-foreground border-primary shadow-glow"
                  : "bg-card border-border shadow-card"
              }`}
            >
              <div className="flex items-center justify-between mb-1">
                <p className={`text-xs font-semibold uppercase tracking-wide ${pkg.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                  {pkg.label}
                </p>
                {pkg.highlight && <Badge className="text-xs bg-white text-primary">Popular</Badge>}
              </div>
              <p className={`text-2xl font-extrabold mb-1 ${pkg.highlight ? "text-primary-foreground" : "text-foreground"}`}>
                {pkg.price}
              </p>
              <p className={`text-sm mb-4 ${pkg.highlight ? "text-primary-foreground/70" : "text-muted-foreground"}`}>
                {pkg.credits} créditos · {pkg.perCredit}
              </p>
              <ul className={`space-y-2 text-sm flex-1 mb-6 ${pkg.highlight ? "text-primary-foreground/90" : "text-foreground"}`}>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Créditos nunca expiram
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  PIX ou cartão de crédito
                </li>
                <li className="flex items-center gap-2">
                  <CheckCircle2 className="w-4 h-4 shrink-0" aria-hidden="true" />
                  Acesso imediato
                </li>
              </ul>
              <Link to="/auth">
                <Button
                  className={`w-full ${pkg.highlight ? "bg-white text-primary hover:bg-white/90" : ""}`}
                  variant={pkg.highlight ? "default" : "outline"}
                >
                  Comprar
                </Button>
              </Link>
            </div>
          ))}
        </div>

        <p className="text-xs text-muted-foreground text-center mt-6">
          PIX ou cartão via Mercado Pago. Créditos nunca expiram.
        </p>
      </div>
    </section>
  );
}
