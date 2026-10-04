import LandingHeader from "@/components/landing/LandingHeader";
import HeroSection from "@/components/landing/HeroSection";
import ProofSection from "@/components/landing/ProofSection";
import PainSection from "@/components/landing/PainSection";
import HowItWorksSection from "@/components/landing/HowItWorksSection";
import FeaturesSection from "@/components/landing/FeaturesSection";
import IsaSection from "@/components/landing/IsaSection";
import EthicsSection from "@/components/landing/EthicsSection";
import PricingSection from "@/components/landing/PricingSection";
import FaqSection from "@/components/landing/FaqSection";
import FinalCtaSection from "@/components/landing/FinalCtaSection";
import LandingFooter from "@/components/landing/LandingFooter";
import MobileCtaBar from "@/components/landing/MobileCtaBar";

// The public landing. `.landing` scopes the lp theme tokens (src/index.css), so nothing
// here leaks into the app. It reads no session: a logged-in visitor gets the same page.
export default function LandingPage() {
  return (
    <div className="landing min-h-screen">
      <a
        href="#conteudo"
        className="sr-only focus:not-sr-only focus:fixed focus:left-3 focus:top-3 focus:z-[100] focus:rounded-lg focus:bg-lp-surface focus:px-4 focus:py-3 focus:font-poppins focus:font-semibold focus:text-lp-ink focus:shadow-[0_6px_24px_rgba(22,40,43,0.25)]"
      >
        Pular para o conteúdo
      </a>
      <LandingHeader />
      {/* tabIndex -1 lets the skip link move the focus here; the container itself is not interactive.
          scroll-mt-20 keeps the first content out from under the sticky header after the skip. */}
      <main id="conteudo" tabIndex={-1} className="scroll-mt-20 focus:outline-none">
        <HeroSection />
        <ProofSection />
        <PainSection />
        <HowItWorksSection />
        <FeaturesSection />
        <IsaSection />
        <EthicsSection />
        <PricingSection />
        <FaqSection />
        <FinalCtaSection />
      </main>
      <LandingFooter />
      <MobileCtaBar />
    </div>
  );
}
