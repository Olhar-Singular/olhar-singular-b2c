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
  return new Date(iso).toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

export default function MyAdaptationsPage() {
  const navigate = useNavigate();
  const { data: adaptations = [], isLoading } = useAdaptations();
  const remove = useDeleteAdaptation();
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  async function handleDelete() {
    /* v8 ignore next -- guard: Confirmar is only shown when a target is set */
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold text-foreground">Minhas Adaptações</h1>
        <Button onClick={() => navigate("/adaptar")}>
          <Plus className="w-4 h-4 mr-1" /> Nova adaptação
        </Button>
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : adaptations.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Você ainda não salvou nenhuma adaptação.
        </p>
      ) : (
        <ul className="space-y-3">
          {adaptations.map((a) => (
            <li key={a.id}>
              <Card>
                <CardContent className="flex items-center justify-between gap-4 p-4">
                  <div className="flex items-center gap-3 min-w-0">
                    <FileText className="w-5 h-5 text-primary shrink-0" />
                    <div className="min-w-0">
                      <p className="font-medium truncate">
                        {a.title || "Adaptação sem título"}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Atualizada em {formatDate(a.updated_at)}
                      </p>
                    </div>
                    <Badge variant={a.status === "ready" ? "default" : "secondary"}>
                      {a.status === "ready" ? "Salva" : "Rascunho"}
                    </Badge>
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
            <AlertDialogDescription>
              Esta ação não pode ser desfeita.
            </AlertDialogDescription>
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
