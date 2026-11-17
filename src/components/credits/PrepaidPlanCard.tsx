import { Link } from "react-router-dom";
import { format } from "date-fns";
import { QrCode } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatDate } from "@/lib/domain/subscriptionUi";
import type { ActivePrepaid } from "@/lib/domain/prepaid";

const integer = new Intl.NumberFormat("pt-BR");

// The Créditos area while a Pix prepaid plan runs (R10): when it ends, what is
// still waiting for the 8th day, and the way to renew. It takes the place of
// the subscription invite (the two never run together, R6).
export default function PrepaidPlanCard({ prepaid }: { prepaid: ActivePrepaid }) {
  return (
    <Card className="border-border">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">Plano à vista</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm font-medium text-foreground">Válido até {formatDate(prepaid.periodEnd)}</p>
        {prepaid.lockedCredits > 0 && prepaid.unlockAt && (
          <p className="text-sm text-foreground">
            +{integer.format(prepaid.lockedCredits)} créditos entram em {format(prepaid.unlockAt, "dd/MM")}
          </p>
        )}
        <p className="text-sm text-muted-foreground">
          Pagamento único no Pix: não renova sozinho. Para continuar depois dessa data, renove no Pix.
        </p>
        <Button asChild className="gap-1.5">
          <Link to="/assinar?pagamento=pix">
            <QrCode className="h-4 w-4" aria-hidden="true" />
            Renovar no Pix
          </Link>
        </Button>
      </CardContent>
    </Card>
  );
}
