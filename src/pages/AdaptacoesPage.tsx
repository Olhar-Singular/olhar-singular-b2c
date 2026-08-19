import { useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { FileText, Pencil, Trash2, Plus, Copy, FolderPlus, FolderOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
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
import {
  useAdaptations,
  useDeleteAdaptation,
  useDuplicateAdaptation,
} from "@/hooks/useAdaptations";
import {
  useFolders,
  useCreateFolder,
  useRenameFolder,
  useDeleteFolder,
  useMoveAdaptation,
} from "@/hooks/useFolders";
import { SUBJECTS } from "@/lib/utils/constants";
import { ACTIVITY_TYPES, activityTypeLabel } from "@/lib/domain/activityTypes";
import { filterRows, groupByFolder } from "./adaptacoes/libraryView";

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
  const { data: folders = [] } = useFolders();
  const remove = useDeleteAdaptation();
  const duplicate = useDuplicateAdaptation();
  const createFolder = useCreateFolder();
  const renameFolder = useRenameFolder();
  const deleteFolder = useDeleteFolder();
  const move = useMoveAdaptation();

  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);
  const [folderToDelete, setFolderToDelete] = useState<{ id: string; name: string } | null>(null);
  const [newFolder, setNewFolder] = useState("");
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);
  const [subject, setSubject] = useState<string | null>(null);
  const [activityType, setActivityType] = useState<string | null>(null);

  const groups = useMemo(
    () => groupByFolder(filterRows(all, { subject, activityType }), folders),
    [all, folders, subject, activityType],
  );

  async function handleDelete() {
    /* v8 ignore next -- guard: Confirmar só aparece quando há target */
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  }

  async function handleDeleteFolder() {
    /* v8 ignore next -- guard: Confirmar só aparece quando há target */
    if (!folderToDelete) return;
    await deleteFolder.mutateAsync(folderToDelete.id);
    setFolderToDelete(null);
  }

  async function submitNewFolder() {
    if (!newFolder.trim()) return;
    await createFolder.mutateAsync(newFolder);
    setNewFolder("");
    setCreating(false);
  }

  async function submitRename() {
    /* v8 ignore next -- guard: o campo só existe enquanto renaming está setado */
    if (!renaming || !renaming.name.trim()) return;
    await renameFolder.mutateAsync({ id: renaming.id, name: renaming.name });
    setRenaming(null);
  }

  return (
    <div className="mx-auto max-w-4xl px-4 py-6 space-y-6">
      <div className="flex items-center justify-between gap-3">
        <h1 className="text-2xl font-semibold text-foreground">Adaptações</h1>
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={() => setCreating(true)}>
            <FolderPlus className="w-4 h-4 mr-1" /> Nova pasta
          </Button>
          <Button onClick={() => navigate("/adaptar")}>
            <Plus className="w-4 h-4 mr-1" /> Nova adaptação
          </Button>
        </div>
      </div>

      {creating && (
        <div className="flex items-center gap-2">
          <Input
            autoFocus
            aria-label="Nome da nova pasta"
            placeholder="Ex.: 6º ano B, Recuperação 2º bimestre"
            value={newFolder}
            onChange={(e) => setNewFolder(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && submitNewFolder()}
          />
          <Button onClick={submitNewFolder} disabled={!newFolder.trim()}>Criar</Button>
          <Button variant="ghost" onClick={() => { setCreating(false); setNewFolder(""); }}>
            Cancelar
          </Button>
        </div>
      )}

      {/* Matéria e tipo são facetas do que a adaptação É; a pasta é onde ela foi
          guardada. Perguntas diferentes, por isso controles separados. */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          aria-label="Filtrar por matéria"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={subject ?? ""}
          onChange={(e) => setSubject(e.target.value || null)}
        >
          <option value="">Todas as matérias</option>
          {SUBJECTS.map((s) => <option key={s} value={s}>{s}</option>)}
        </select>
        <select
          aria-label="Filtrar por tipo"
          className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
          value={activityType ?? ""}
          onChange={(e) => setActivityType(e.target.value || null)}
        >
          <option value="">Todos os tipos</option>
          {ACTIVITY_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
        {(subject || activityType) && (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => { setSubject(null); setActivityType(null); }}
          >
            Limpar filtros
          </Button>
        )}
      </div>

      {isLoading ? (
        <p className="text-sm text-muted-foreground">Carregando…</p>
      ) : all.length === 0 ? (
        <div className="text-center py-16 space-y-3">
          <FileText className="w-10 h-10 text-muted-foreground mx-auto" />
          <p className="text-sm text-muted-foreground">Nenhuma adaptação ainda.</p>
          <Button variant="outline" onClick={() => navigate("/adaptar")}>Criar primeira adaptação</Button>
        </div>
      ) : (
        groups.map((group) => (
          <section key={group.id ?? "unfiled"} className="space-y-3">
            <div className="flex items-center gap-2">
              {renaming?.id === group.id ? (
                <>
                  <Input
                    autoFocus
                    aria-label="Novo nome da pasta"
                    value={renaming.name}
                    onChange={(e) => setRenaming({ id: renaming.id, name: e.target.value })}
                    className="max-w-xs"
                  />
                  <Button size="sm" onClick={submitRename}>Salvar</Button>
                  <Button size="sm" variant="ghost" onClick={() => setRenaming(null)}>Cancelar</Button>
                </>
              ) : (
                <>
                  <FolderOpen className="w-4 h-4 text-muted-foreground" aria-hidden="true" />
                  <h2 className="text-sm font-semibold text-muted-foreground">{group.name}</h2>
                  <span className="text-xs text-muted-foreground">({group.rows.length})</span>
                  {group.id && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRenaming({ id: group.id as string, name: group.name })}
                        aria-label={`Renomear pasta ${group.name}`}
                      >
                        <Pencil className="w-3.5 h-3.5" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setFolderToDelete({ id: group.id as string, name: group.name })}
                        aria-label={`Excluir pasta ${group.name}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </Button>
                    </>
                  )}
                </>
              )}
            </div>

            {group.rows.length === 0 ? (
              <p className="pl-6 text-xs text-muted-foreground">Pasta vazia.</p>
            ) : (
              <ul className="space-y-3">
                {group.rows.map((a) => (
                  <li key={a.id}>
                    <Card>
                      <CardContent className="flex items-center justify-between gap-4 p-4">
                        <div className="flex items-center gap-3 min-w-0">
                          <FileText className="w-5 h-5 text-primary shrink-0" />
                          <div className="min-w-0">
                            <p className="font-medium truncate">{a.title || "Adaptação sem título"}</p>
                            <div className="flex flex-wrap items-center gap-2 mt-0.5">
                              {a.activity_type && (
                                <Badge variant="secondary" className="text-xs">
                                  {activityTypeLabel(a.activity_type)}
                                </Badge>
                              )}
                              {a.subject && (
                                <Badge variant="outline" className="text-xs">{a.subject}</Badge>
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
                          <select
                            aria-label={`Mover ${a.title || "adaptação"} para outra pasta`}
                            className="max-w-[9rem] rounded-md border border-input bg-background px-2 py-1 text-xs"
                            value={a.folder_id ?? ""}
                            onChange={(e) =>
                              move.mutateAsync({ adaptationId: a.id, folderId: e.target.value || null })
                            }
                          >
                            <option value="">Sem pasta</option>
                            {folders.map((f) => (
                              <option key={f.id} value={f.id}>{f.name}</option>
                            ))}
                          </select>
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
                            onClick={() =>
                              duplicate.mutateAsync({
                                id: a.id,
                                title: `${a.title || "Adaptação sem título"} (cópia)`,
                              })
                            }
                            disabled={duplicate.isPending}
                            aria-label={`Duplicar ${a.title || "adaptação"}`}
                          >
                            <Copy className="w-4 h-4" />
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

      <AlertDialog open={!!folderToDelete} onOpenChange={(open) => !open && setFolderToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir a pasta {folderToDelete?.name}?</AlertDialogTitle>
            {/* Dito na cara, porque o oposto é justamente o que se teme: as
                adaptações são trabalho pago, e o FK é ON DELETE SET NULL. */}
            <AlertDialogDescription>
              As adaptações que estão nela NÃO serão excluídas — elas voltam para Sem pasta.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteFolder}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Excluir pasta
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
