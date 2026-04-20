import { useState } from "react";
import { Plus, Pencil, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { BarrierProfileForm, type BarrierProfileFormValues } from "@/components/BarrierProfileForm";
import {
  useBarrierProfiles,
  useCreateBarrierProfile,
  useUpdateBarrierProfile,
  useDeleteBarrierProfile,
} from "@/hooks/useBarrierProfiles";
import type { Database } from "@/integrations/supabase/types";

type BarrierProfile = Database["public"]["Tables"]["barrier_profiles"]["Row"];

export default function BarrierProfilesPage() {
  const { data: profiles = [], isLoading } = useBarrierProfiles();
  const create = useCreateBarrierProfile();
  const update = useUpdateBarrierProfile();
  const remove = useDeleteBarrierProfile();

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<BarrierProfile | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<string | null>(null);

  function openCreate() {
    setEditing(null);
    setDialogOpen(true);
  }

  function openEdit(profile: BarrierProfile) {
    setEditing(profile);
    setDialogOpen(true);
  }

  async function handleSubmit(values: BarrierProfileFormValues) {
    if (editing) {
      await update.mutateAsync({ id: editing.id, ...values });
    } else {
      await create.mutateAsync(values);
    }
    setDialogOpen(false);
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    await remove.mutateAsync(deleteTarget);
    setDeleteTarget(null);
  }

  return (
    <main className="mx-auto max-w-2xl px-4 py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Perfis de Barreira</h1>
        <Button onClick={openCreate} className="gap-2">
          <Plus className="w-4 h-4" />
          Novo perfil
        </Button>
      </div>

      {isLoading && (
        <p className="text-muted-foreground text-sm">Carregando...</p>
      )}

      {!isLoading && profiles.length === 0 && (
        <div className="text-center py-16 text-muted-foreground">
          <p className="text-sm">Nenhum perfil criado ainda.</p>
          <p className="text-sm mt-1">Crie um perfil para agilizar suas adaptações.</p>
        </div>
      )}

      <ul className="space-y-3">
        {profiles.map((profile) => (
          <li key={profile.id} className="rounded-lg border bg-card p-4 shadow-card flex items-start justify-between gap-4">
            <div className="space-y-1.5 min-w-0">
              <div className="flex flex-wrap gap-1.5">
                <Badge variant="secondary">
                  {profile.barriers.length} barreira{profile.barriers.length !== 1 ? "s" : ""}
                </Badge>
              </div>
              {profile.observation && (
                <p className="text-sm text-muted-foreground line-clamp-2">{profile.observation}</p>
              )}
            </div>
            <div className="flex gap-1 shrink-0">
              <Button variant="ghost" size="icon" aria-label="Editar" onClick={() => openEdit(profile)}>
                <Pencil className="w-4 h-4" />
              </Button>
              <Button
                variant="ghost"
                size="icon"
                aria-label="Excluir"
                className="text-destructive hover:text-destructive"
                onClick={() => setDeleteTarget(profile.id)}
              >
                <Trash2 className="w-4 h-4" />
              </Button>
            </div>
          </li>
        ))}
      </ul>

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? "Editar perfil" : "Novo perfil de barreira"}</DialogTitle>
          </DialogHeader>
          <BarrierProfileForm
            defaultValues={
              editing
                ? { barriers: editing.barriers, observation: editing.observation }
                : undefined
            }
            onSubmit={handleSubmit}
            isPending={create.isPending || update.isPending}
          />
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => !o && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir perfil?</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação não pode ser desfeita. Adaptações vinculadas a este perfil não serão apagadas.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={remove.isPending}>
              Confirmar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
