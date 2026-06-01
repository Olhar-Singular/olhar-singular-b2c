import { DollarSign, CalendarDays, CalendarRange } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { formatUsd } from "@/lib/utils/adminFormat";
import type { AdminMetrics } from "@/types/admin";

const CARDS = [
  { key: "total_usd", label: "Custo total (IA)", icon: DollarSign },
  { key: "today_usd", label: "Custo hoje", icon: CalendarDays },
  { key: "month_usd", label: "Custo no mês", icon: CalendarRange },
] as const;

export function StatCards({ metrics }: { metrics: AdminMetrics }) {
  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {CARDS.map(({ key, label, icon: Icon }) => (
        <Card key={key}>
          <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">{label}</CardTitle>
            <Icon className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          </CardHeader>
          <CardContent>
            <p className="text-2xl font-bold tabular-nums">{formatUsd(metrics[key])}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
