import { useEffect, useState } from "react";
import { Link, useLocation } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { browserStorage, DENIED_ALL, GRANTED_ALL, readStoredConsent, storeConsent, type Consent } from "@/lib/analytics/consent";
import { gtagConsentUpdate } from "@/lib/analytics/dataLayer";
import { trackConsentUpdated } from "@/lib/analytics/events";
import { bootAnalytics } from "@/lib/analytics/boot";
import { GTM_BLOCKED_PATHS } from "@/lib/analytics/gtm";

// LGPD notice with Consent Mode v2: nothing beyond essential cookies runs
// until the visitor decides. A dialog without focus trap: it must never block
// reading the page. Hidden on the checkout, where analytics never load anyway.
export function ConsentBanner() {
  const location = useLocation();
  const [decided, setDecided] = useState<boolean>(() => readStoredConsent(browserStorage()) !== null);

  // Every navigation re-runs the boot: GTM on allowed routes, attribution refresh.
  useEffect(() => {
    bootAnalytics({
      pathname: location.pathname,
      search: location.search,
      referrer: document.referrer,
      cookie: document.cookie,
    });
  }, [location.pathname, location.search]);

  function decide(consent: Consent) {
    storeConsent(browserStorage(), consent);
    gtagConsentUpdate(consent);
    trackConsentUpdated(consent);
    setDecided(true);
    // Re-capture so the cookies allowed by the new consent join the attribution.
    bootAnalytics({
      pathname: location.pathname,
      search: location.search,
      referrer: document.referrer,
      cookie: document.cookie,
    });
  }

  const hidden = decided || GTM_BLOCKED_PATHS.some((p) => location.pathname === p || location.pathname.startsWith(`${p}/`));
  if (hidden) return null;

  return (
    <div
      role="dialog"
      aria-labelledby="consent-title"
      aria-describedby="consent-text"
      className="fixed inset-x-0 bottom-0 z-50 border-t border-border bg-card/95 backdrop-blur-md p-4 shadow-lg"
    >
      <div className="mx-auto flex max-w-5xl flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-1">
          <p id="consent-title" className="text-sm font-semibold text-foreground">
            Cookies e medição
          </p>
          <p id="consent-text" className="text-sm text-muted-foreground">
            Usamos cookies essenciais para a sessão e, com a sua permissão, cookies de medição e marketing para entender o que funciona.{" "}
            <Link to="/privacidade" className="underline">
              Política de Privacidade
            </Link>
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => decide(DENIED_ALL)}>
            Só essenciais
          </Button>
          <Button size="sm" onClick={() => decide(GRANTED_ALL)}>
            Aceitar
          </Button>
        </div>
      </div>
    </div>
  );
}
