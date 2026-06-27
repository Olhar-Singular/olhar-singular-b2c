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

export default function AdaptacoesPage() {
  const navigate = useNavigate();
  const { data: all = [], isLoading } = useAdaptations();
  const remove = useDeleteAdaptation();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  const adaptations = all.filter((a) => a.status === "ready");

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
          <p className="text-sm text-muted-foreground">Nenhuma adaptação concluída ainda.</p>
          <Button variant="outline" onClick={() => navigate("/adaptar")}>Criar primeira adaptação</Button>
        </div>
      ) : (
        <ul className="space-y-3">
          {adaptations.map((a) => (
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
