import { Link } from "react-router-dom";
import { AlertTriangle, Clock, Coins, Loader2 } from "lucide-react";
import type { Access } from "@/lib/domain/access";
import type { SubscriptionView } from "@/hooks/useSubscription";
import { isRecentRejection } from "@/lib/domain/subscriptionUi";

interface Props {
  access: Access | null;
  /** The owner's latest subscription, when loaded; undefined while unknown. */
  subscription?: SubscriptionView | null;
  now?: Date;
}

// One line under the header that says where the account stands: a charge that
// failed, a subscription still being validated, days left of a trial, a trial
// that ended, or credits that ran out. Soft paywall: nothing here blocks
// navigation; the paid actions themselves refuse (402) and point to the same
// place.
export function AccessBanner({ access, subscription, now = new Date() }: Props) {
  if (!access || access.unlimited) return null;

  if (subscription?.status === "past_due") {
    return (
      <div
        role="status"
        className="bg-destructive/10 text-destructive text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap"
      >
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Não conseguimos cobrar a sua assinatura. Atualize o cartão para manter seus créditos.</span>
        <Link to="/creditos" className="font-medium underline">
          Trocar cartão
        </Link>
      </div>
    );
  }

  if (subscription?.status === "pending") {
    return (
      <div
        role="status"
        className="bg-primary/10 text-primary text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap"
      >
        <Loader2 className="w-4 h-4 shrink-0 animate-spin" aria-hidden="true" />
        <span>Sua assinatura está em análise. Os créditos entram assim que o cartão for confirmado.</span>
      </div>
    );
  }

  if (isRecentRejection(subscription, now)) {
    return (
      <div
        role="status"
        className="bg-amber-50 text-amber-900 text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap"
      >
        <AlertTriangle className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>O cartão da assinatura foi recusado. Você pode tentar com outro cartão.</span>
        <Link to="/assinar" className="font-medium underline">
          Tentar de novo
        </Link>
      </div>
    );
  }

  if (access.kind === "trial" && !access.trialExpired && access.daysLeft !== null) {
    const days = access.daysLeft;
    return (
      <div
        role="status"
        className="bg-primary/10 text-primary text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap"
      >
        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>
          Período de teste: {days === 1 ? "1 dia restante" : `${days} dias restantes`} e{" "}
          {access.planCredits} {access.planCredits === 1 ? "crédito" : "créditos"} para usar.
        </span>
      </div>
    );
  }

  if (access.trialExpired && access.extraCredits === 0) {
    return (
      <div
        role="status"
        className="bg-amber-50 text-amber-900 text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap"
      >
        <Clock className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Seu período de teste terminou. Você ainda pode ler e editar suas adaptações.</span>
        <Link to="/creditos" className="font-medium underline">
          Ver créditos
        </Link>
      </div>
    );
  }

  if (access.paywalled) {
    return (
      <div
        role="status"
        className="bg-amber-50 text-amber-900 text-sm px-4 py-2 flex items-center justify-center gap-2 flex-wrap"
      >
        <Coins className="w-4 h-4 shrink-0" aria-hidden="true" />
        <span>Seus créditos acabaram. Adaptar, extrair e conversar com a ISA ficam pausados.</span>
        <Link to="/creditos" className="font-medium underline">
          Comprar créditos
        </Link>
      </div>
    );
  }

  return null;
}
