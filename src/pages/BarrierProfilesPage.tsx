import { useState } from "react";
import { Plus, Pencil, Trash2, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
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
import { BARRIER_DIMENSIONS } from "@/lib/barriers";
import type { Database } from "@/integrations/supabase/types";

type BarrierProfile = Database["public"]["Tables"]["barrier_profiles"]["Row"];

function barrierLabel(key: string) {
  for (const dim of BARRIER_DIMENSIONS) {
    const b = dim.barriers.find((b) => b.key === key);
    if (b) return b.label;
  }
  return key;
}

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
    <div className="mx-auto max-w-3xl px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Perfis de Barreira</h1>
          <p className="text-muted-foreground text-sm">
            Perfis anônimos de necessidades de aprendizagem
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="w-4 h-4 mr-2" />
          Novo perfil
        </Button>
      </div>

      {/* Loading */}
      {isLoading && (
        <p className="text-sm text-muted-foreground text-center py-10">Carregando...</p>
      )}

      {/* Empty state */}
      {!isLoading && profiles.length === 0 && (
        <div className="text-center py-16">
          <User className="w-12 h-12 text-muted-foreground/40 mx-auto mb-3" />
          <p className="text-muted-foreground">Nenhum perfil criado ainda.</p>
          <p className="text-sm text-muted-foreground mt-1">
            Crie um perfil para agilizar suas adaptações.
          </p>
          <Button variant="outline" className="mt-4" onClick={openCreate}>
            <Plus className="w-4 h-4 mr-2" />
            Criar primeiro perfil
          </Button>
        </div>
      )}

      {/* Profile cards grid */}
      {profiles.length > 0 && (
        <div className="grid sm:grid-cols-2 gap-4">
          {profiles.map((profile) => (
            <Card
              key={profile.id}
              className="hover:shadow-card-hover transition-shadow border-border group relative"
            >
              <CardContent className="p-5">
                {/* Barrier badges */}
                <div className="flex flex-wrap gap-1.5 mb-3 pr-16">
                  {profile.barriers.slice(0, 3).map((key) => (
                    <Badge key={key} variant="secondary" className="text-xs">
                      {barrierLabel(key)}
                    </Badge>
                  ))}
                  {profile.barriers.length > 3 && (
                    <Badge variant="outline" className="text-xs">
                      +{profile.barriers.length - 3}
                    </Badge>
                  )}
                </div>

                {/* Stats */}
                <p className="text-xs text-muted-foreground">
                  {profile.barriers.length} barreira
                  {profile.barriers.length !== 1 ? "s" : ""} selecionada
                  {profile.barriers.length !== 1 ? "s" : ""}
                </p>

                {/* Observation */}
                {profile.observation && (
                  <p className="text-xs text-muted-foreground mt-1.5 line-clamp-2 italic">
                    "{profile.observation}"
                  </p>
                )}
              </CardContent>

              {/* Action buttons */}
              <div className="absolute top-3 right-3 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  aria-label="Editar"
                  onClick={() => openEdit(profile)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors"
                >
                  <Pencil className="w-3.5 h-3.5" />
                </button>
                <button
                  aria-label="Excluir"
                  onClick={() => setDeleteTarget(profile.id)}
                  className="p-1.5 rounded-md text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-colors"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            </Card>
          ))}
        </div>
      )}

      {/* Create / Edit dialog */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editing ? "Editar perfil" : "Novo perfil de barreira"}
            </DialogTitle>
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
              Esta ação não pode ser desfeita. Adaptações vinculadas não serão apagadas.
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
    </div>
  );
}
