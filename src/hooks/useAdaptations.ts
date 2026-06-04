/**
 * Read/mutation hooks for saved adaptations — the ONE read path.
 *
 * Centralizes query keys + invalidation over `adaptationsRepo` so the history
 * list and the editor stay in sync after a save, markReady, or delete.
 */

import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  listAdaptations,
  getAdaptation,
  markReady,
  deleteAdaptation,
} from "@/lib/adaptation/persistence/adaptationsRepo";
import { useAuth } from "@/hooks/useAuth";
import { parseDbError } from "@/lib/utils/errors";

export const adaptationKeys = {
  all: ["adaptations"] as const,
  list: () => [...adaptationKeys.all, "list"] as const,
  detail: (id: string) => [...adaptationKeys.all, "detail", id] as const,
};

/** List the current user's adaptations (history). */
export function useAdaptations() {
  const { user } = useAuth();
  return useQuery({
    queryKey: adaptationKeys.list(),
    queryFn: listAdaptations,
    enabled: !!user,
    staleTime: 1000 * 60,
  });
}

/** Fetch a single adaptation by id (edit-after-save rehydration). */
export function useAdaptation(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: adaptationKeys.detail(id ?? ""),
    queryFn: () => getAdaptation(id!),
    enabled: !!user && !!id,
  });
}

/**
 * Flip an adaptation to 'ready' under optimistic concurrency. On success the
 * list + detail are invalidated; a conflict (stale updated_at) is returned to
 * the caller so it can warn + reload instead of navigating away blind.
 */
export function useMarkReady() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, expectedUpdatedAt }: { id: string; expectedUpdatedAt: string }) =>
      markReady(id, expectedUpdatedAt),
    onSuccess: (res, { id }) => {
      if (!res.ok) return;
      qc.invalidateQueries({ queryKey: adaptationKeys.list() });
      qc.invalidateQueries({ queryKey: adaptationKeys.detail(id) });
    },
    onError: (err: Error) => toast.error(parseDbError(err, "Erro ao salvar a adaptação.")),
  });
}

/** Delete an adaptation. Invalidates the list. */
export function useDeleteAdaptation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => deleteAdaptation(id),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adaptationKeys.list() });
      toast.success("Adaptação excluída.");
    },
    onError: (err: Error) => toast.error(parseDbError(err, "Erro ao excluir a adaptação.")),
  });
}
