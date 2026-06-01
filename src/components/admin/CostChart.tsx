import { useState } from "react";
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { format, parseISO } from "date-fns";
import { ptBR } from "date-fns/locale";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { formatUsd } from "@/lib/utils/adminFormat";
import type { AdminCostPoint } from "@/types/admin";

type View = "daily" | "monthly";

function formatBucket(iso: string, view: View): string {
  const date = parseISO(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return view === "daily"
    ? format(date, "dd/MM", { locale: ptBR })
    : format(date, "MMM/yy", { locale: ptBR });
}

export function CostChart({ daily, monthly }: { daily: AdminCostPoint[]; monthly: AdminCostPoint[] }) {
  const [view, setView] = useState<View>("daily");
  const points = view === "daily" ? daily : monthly;
  const data = points.map((p) => ({ label: formatBucket(p.bucket, view), cost: p.cost }));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle className="text-base">Custo de IA (USD)</CardTitle>
        <div className="flex gap-1" role="group" aria-label="Granularidade do gráfico">
          <Button size="sm" variant={view === "daily" ? "default" : "outline"} onClick={() => setView("daily")}>
            Diário
          </Button>
          <Button size="sm" variant={view === "monthly" ? "default" : "outline"} onClick={() => setView("monthly")}>
            Mensal
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {data.length === 0 ? (
          <p className="py-12 text-center text-sm text-muted-foreground">Sem dados de custo no período.</p>
        ) : (
          <ResponsiveContainer width="100%" height={280}>
            <LineChart data={data} margin={{ top: 8, right: 16, bottom: 8, left: 8 }}>
              <CartesianGrid strokeDasharray="3 3" className="stroke-muted" />
              <XAxis dataKey="label" tick={{ fontSize: 12 }} />
              <YAxis tick={{ fontSize: 12 }} width={72} tickFormatter={(v) => formatUsd(Number(v))} />
              <Tooltip formatter={(v) => formatUsd(Number(v))} />
              <Line type="monotone" dataKey="cost" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        )}
      </CardContent>
    </Card>
  );
}
