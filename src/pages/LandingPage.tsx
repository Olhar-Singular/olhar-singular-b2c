import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import PricingSection from "@/components/landing/PricingSection";
import FaqSection from "@/components/landing/FaqSection";
import LandingFooter from "@/components/landing/LandingFooter";

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-background">
      <LandingHeader />
      <HeroSection />
      <HowItWorksSection />
      <FeaturesSection />
      <PricingSection />
      <FaqSection />

      {/* CTA final */}
      <section className="py-16 lg:py-20 gradient-hero">
        <div className="max-w-2xl mx-auto px-4 text-center">
          <h2 className="text-3xl font-bold text-primary-foreground mb-4">
            Comece a adaptar hoje, de graça
          </h2>
          <p className="text-primary-foreground/80 mb-8">
            10 créditos grátis ao cadastrar. Sem cartão. Sem compromisso.
          </p>
          <Link to="/auth?signup=1">
            <Button size="lg" className="bg-white text-primary hover:bg-white/90 font-semibold gap-2">
              Começar grátis
              <ArrowRight className="w-4 h-4" aria-hidden="true" />
            </Button>
          </Link>
        </div>
      </section>

      <LandingFooter />
    </div>
  );
}
