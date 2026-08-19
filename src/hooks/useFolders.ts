/**
 * Folder CRUD for the adaptation library, over `foldersRepo`.
 *
 * Every mutation invalidates the adaptation LIST too, not just the folder list:
 * moving or deleting a folder changes where the adaptations appear, and a stale
 * list would show a prova under a folder that no longer exists.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listFolders,
  createFolder,
  renameFolder,
  deleteFolder,
  moveAdaptationToFolder,
} from "@/lib/adaptation/persistence/foldersRepo";
import { adaptationKeys } from "@/hooks/useAdaptations";
import { useAuth } from "@/hooks/useAuth";
import { parseDbError } from "@/lib/utils/errors";

export const folderKeys = {
  all: ["adaptation_folders"] as const,
  list: () => [...folderKeys.all, "list"] as const,
};

export function useFolders() {
  const { user } = useAuth();
  return useQuery({
    queryKey: folderKeys.list(),
    queryFn: listFolders,
    enabled: !!user,
    staleTime: 1000 * 60 * 5,
  });
}

export function useCreateFolder() {
  const { user } = useAuth();
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => createFolder(user!.id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.list() });
      toast.success("Pasta criada.");
    },
    onError: (err: Error) =>
      toast.error(parseDbError(err, "Erro ao criar a pasta. Já existe uma com esse nome?")),
  });
}

export function useRenameFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, name }: { id: string; name: string }) => renameFolder(id, name),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.list() });
      toast.success("Pasta renomeada.");
    },
    onError: (err: Error) =>
      toast.error(parseDbError(err, "Erro ao renomear a pasta. Já existe uma com esse nome?")),
  });
}

export function useDeleteFolder() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteFolder(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: folderKeys.list() });
      // The adaptations that were inside are now unfiled, not gone.
      qc.invalidateQueries({ queryKey: adaptationKeys.list() });
      toast.success("Pasta excluída. As adaptações dela continuam em “Sem pasta”.");
    },
    onError: (err: Error) => toast.error(parseDbError(err, "Erro ao excluir a pasta.")),
  });
}

export function useMoveAdaptation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ adaptationId, folderId }: { adaptationId: string; folderId: string | null }) =>
      moveAdaptationToFolder(adaptationId, folderId),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adaptationKeys.list() });
    },
    onError: (err: Error) => toast.error(parseDbError(err, "Erro ao mover a adaptação.")),
  });
}
