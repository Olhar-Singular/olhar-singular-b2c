import LandingCta from "./LandingCta";
import { useScrolledPast } from "./useScrolledPast";
import { useConsentDecided } from "@/lib/analytics/useConsentDecided";
import { TRIAL_DAYS } from "@/lib/domain/subscriptionUi";

// z-40 stays BELOW the consent banner (fixed bottom-0 z-50), so the banner is never covered.
// Not mounted while the banner is up either: hidden behind it the link would still take
// keyboard focus without being visible. Mounted only after the hero, which owns the CTA up there.
export default function MobileCtaBar() {
  const pastHero = useScrolledPast();
  const consentDecided = useConsentDecided();

  if (!pastHero || !consentDecided) return null;

  return (
    <div className="fixed inset-x-0 bottom-0 z-40 border-t border-lp-border bg-[rgba(248,250,250,0.97)] px-4 pt-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] shadow-[0_-6px_24px_rgba(22,40,43,0.12)] min-[760px]:hidden">
      <LandingCta to="/assinar?trial=1" origem="barra-mobile" className="min-h-[52px] w-full text-[17px]">
        Testar {TRIAL_DAYS} dias grátis
      </LandingCta>
    </div>
  );
}
