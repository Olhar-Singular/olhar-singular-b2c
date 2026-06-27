import { FileText, FileSearch, Coins } from "lucide-react";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useActivityLog } from "@/hooks/useActivityLog";
import type { ActivityLogItem } from "@/hooks/useActivityLog";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function CreditsLabel({ n, wasFree }: { n: number; wasFree?: boolean }) {
  if (n === 0 || wasFree) return <span className="text-xs text-emerald-600 font-medium">Gratuita</span>;
  return (
    <span className="flex items-center gap-1 text-xs text-muted-foreground">
      <Coins className="w-3 h-3" />
      {n} crédito{n !== 1 ? "s" : ""}
    </span>
  );
}

function AdaptationRow({ item }: { item: Extract<ActivityLogItem, { kind: "adaptation" }> }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <FileText className="w-5 h-5 text-primary shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{item.title}</p>
          <div className="flex items-center gap-2 mt-0.5 flex-wrap">
            {item.activityType && (
              <Badge variant="secondary" className="text-xs">{item.activityType}</Badge>
            )}
            <Badge variant={item.status === "ready" ? "default" : "outline"} className="text-xs">
              {item.status === "ready" ? "Concluída" : "Rascunho"}
            </Badge>
            <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
          </div>
        </div>
        <CreditsLabel n={item.creditsSpent} />
      </CardContent>
    </Card>
  );
}

function ExtractionRow({ item }: { item: Extract<ActivityLogItem, { kind: "extraction" }> }) {
  return (
    <Card>
      <CardContent className="flex items-center gap-4 p-4">
        <FileSearch className="w-5 h-5 text-orange-500 shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="font-medium truncate">{item.fileName}</p>
          <div className="flex items-center gap-2 mt-0.5">
            <span className="text-xs text-muted-foreground">{item.questionsExtracted} questões extraídas</span>
            <span className="text-xs text-muted-foreground">{formatDate(item.date)}</span>
          </div>
        </div>
        <CreditsLabel n={item.creditsSpent} wasFree={item.wasFree} />
      </CardContent>
    </Card>
  );
}

export default function MyAdaptationsPage() {
  const { data: items = [], isLoading } = useActivityLog();

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <h1 className="text-2xl font-semibold text-foreground">Histórico</h1>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : items.length === 0 ? (
        <p className="text-sm text-muted-foreground">Nenhuma atividade registrada ainda.</p>
      ) : (
        <ul className="space-y-3">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              {item.kind === "adaptation" ? (
                <AdaptationRow item={item} />
              ) : (
                <ExtractionRow item={item} />
              )}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
