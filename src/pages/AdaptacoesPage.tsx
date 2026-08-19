import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Pencil, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { useAdaptations, useDeleteAdaptation } from "@/hooks/useAdaptations";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" });
}

function CreditsLabel({ n }: { n: number }) {
  if (n === 0) return <span className="text-xs text-muted-foreground">Gratuita</span>;
  return <span className="text-xs text-muted-foreground">{n} crédito{n !== 1 ? "s" : ""}</span>;
}

const UNFILED = "Sem matéria";

type Listed = { id: string; subject?: string | null };

/**
 * Split the list into folders by subject.
 *
 * Grouping happens here, not in SQL: the page already fetches every row the
 * teacher owns, and a `where subject = ?` query would need its own index for
 * no gain. Unclassified rows get their own group, kept LAST — they are the
 * backlog, not a subject, and every adaptation created before this column
 * existed lands there.
 */
function groupBySubject<T extends Listed>(rows: T[]): Array<{ subject: string; rows: T[] }> {
  const bySubject = new Map<string, T[]>();
  for (const row of rows) {
    const key = row.subject || UNFILED;
    const bucket = bySubject.get(key);
    if (bucket) bucket.push(row);
    else bySubject.set(key, [row]);
  }
  const named = [...bySubject.entries()]
    .filter(([subject]) => subject !== UNFILED)
    .sort(([a], [b]) => a.localeCompare(b, "pt-BR"));
  const unfiled = bySubject.get(UNFILED);
  return [
    ...named.map(([subject, rows]) => ({ subject, rows })),
    ...(unfiled ? [{ subject: UNFILED, rows: unfiled }] : []),
  ];
}

export default function AdaptacoesPage() {
  const navigate = useNavigate();
  const { data: all = [], isLoading } = useAdaptations();
  const remove = useDeleteAdaptation();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  // No status filter. The row is written by the edge function BEFORE the
  // credit reservation is settled, so every adaptation listed here has already
  // been paid for — hiding the ones the teacher never explicitly "finished"
  // meant a generation could be bought and then vanish. `status` is a badge
  // here, not a permission.
  const adaptations = all;
  const groups = groupBySubject(adaptations);

  async function handleDelete() {
    /* v8 ignore next -- guard: Confirmar só aparece quando há target */
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Adaptações</h1>
        <Button onClick={() => navigate("/adaptar")}>
          <Plus className="w-4 h-4 mr-1" /> Nova adaptação
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : adaptations.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhuma adaptação ainda.</p>
          <Button variant="outline" onClick={() => navigate("/adaptar")}>Criar primeira adaptação</Button>
        </div>
      ) : (
        // A single "Sem matéria" heading over everything is noise, so folders
        // only appear once at least one adaptation has actually been filed.
        groups.map((group) => (
          <section key={group.subject} className="space-y-3">
            {groups.length > 1 || group.subject !== UNFILED ? (
              <h2 className="text-sm font-semibold text-muted-foreground">{group.subject}</h2>
            ) : null}
            <ul className="space-y-3">
              {group.rows.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">{a.title || "Adaptação sem título"}</p>
                      <div className="flex items-center gap-2 mt-0.5">
                        {a.activity_type && (
                          <Badge variant="secondary" className="text-xs">{a.activity_type}</Badge>
                        )}
                        <Badge variant={a.status === "ready" ? "default" : "outline"} className="text-xs">
                          {a.status === "ready" ? "Concluída" : "Rascunho"}
                        </Badge>
                        <span className="text-xs text-muted-foreground">{formatDate(a.updated_at)}</span>
                        <CreditsLabel n={a.credits_spent ?? 0} />
                      </div>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => navigate(`/adaptar/editar/${a.id}`)}
                      aria-label={`Editar ${a.title || "adaptação"}`}
                    >
                      <Pencil className="w-4 h-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setDeleteTarget(a.id)}
                      aria-label={`Excluir ${a.title || "adaptação"}`}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            </li>
              ))}
            </ul>
          </section>
        ))
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir adaptação?</AlertDialogTitle>
            <AlertDialogDescription>Esta ação não pode ser desfeita.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDelete}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
