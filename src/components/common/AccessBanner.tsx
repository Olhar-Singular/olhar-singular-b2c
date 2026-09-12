import { Link } from "react-router-dom";
import { Clock, Coins } from "lucide-react";
import type { Access } from "@/lib/domain/access";

interface Props {
  access: Access | null;
}

// One line under the header that says where the account stands: days left of
// a trial, a trial that ended, or credits that ran out. Soft paywall: nothing
// here blocks navigation; the paid actions themselves refuse (402) and point to
// the same place.
export function AccessBanner({ access }: Props) {
  if (!access || access.unlimited) return null;

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
