import { Card, CardContent } from "@/components/ui/card";
import type { AdminSubscriptionSummary } from "@/types/admin";
import { SUBSCRIPTION_STATUS_LABELS } from "@/lib/utils/adminAccess";

interface Props {
  summary: AdminSubscriptionSummary | undefined;
}

function formatBrl(value: number) {
  return value.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
}

const ORDER = ["authorized", "past_due", "paused", "pending", "cancelled", "rejected"];

// Counts by status plus the estimated MRR (sum of the plan prices of the
// authorized subscriptions). Nothing here is money moved: it is a mirror.
export function SubscriptionStats({ summary }: Props) {
  if (!summary) {
    return <p className="text-sm text-muted-foreground">Sem dados de assinatura.</p>;
  }
  const statuses = ORDER.filter((s) => summary.by_status[s]).concat(
    Object.keys(summary.by_status).filter((s) => !ORDER.includes(s)),
  );
  return (
    <div className="space-y-4">
      <div className="grid gap-4 sm:grid-cols-3">
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Assinaturas vivas</p>
            <p className="text-2xl font-bold tabular-nums">{summary.live}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">MRR estimado</p>
            <p className="text-2xl font-bold tabular-nums">{formatBrl(summary.mrr_brl)}</p>
            <p className="text-xs text-muted-foreground">soma dos planos ativos</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <p className="text-xs uppercase text-muted-foreground">Inadimplentes</p>
            <p className="text-2xl font-bold tabular-nums">{summary.by_status.past_due ?? 0}</p>
          </CardContent>
        </Card>
      </div>
      <table className="w-full max-w-md text-sm" aria-label="Assinaturas por status">
        <tbody>
          {statuses.length === 0 ? (
            <tr>
              <td className="py-2 text-muted-foreground">Nenhuma assinatura ainda.</td>
            </tr>
          ) : (
            statuses.map((status) => (
              <tr key={status} className="border-b last:border-0">
                <td className="py-2">{SUBSCRIPTION_STATUS_LABELS[status] ?? status}</td>
                <td className="py-2 text-right tabular-nums">{summary.by_status[status]}</td>
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
