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
  duplicateAdaptation,
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

/**
 * Fetch a single adaptation by id (edit-after-save rehydration).
 *
 * Deliberately inert once it has loaded: this row's ONLY writer is the wizard
 * mounted on top of it, which autosaves every edit. Re-reading it in the
 * background can therefore never bring news — it can only hand the page a
 * fresher `updated_at` and disturb a live editing session. `refetchOnMount` is
 * off for the same reason: coming back to the editor should not re-seed it from
 * the server behind a still-pending local change.
 */
export function useAdaptation(id: string | undefined) {
  const { user } = useAuth();
  return useQuery({
    queryKey: adaptationKeys.detail(id ?? ""),
    queryFn: () => getAdaptation(id!),
    enabled: !!user && !!id,
    staleTime: Infinity,
    refetchOnWindowFocus: false,
    refetchOnMount: false,
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
    mutationFn: ({
      id,
      expectedUpdatedAt,
      subject,
    }: {
      id: string;
      expectedUpdatedAt: string;
      // The folder rides along with the status flip: it is a column, so the
      // autosave never carries it, and a separate UPDATE would bump the row
      // version a second time behind the caller's optimistic token.
      subject?: string | null;
    }) => markReady(id, expectedUpdatedAt, subject === undefined ? {} : { subject }),
    onSuccess: (res, { id }) => {
      if (!res.ok) return;
      qc.invalidateQueries({ queryKey: adaptationKeys.list() });
      qc.invalidateQueries({ queryKey: adaptationKeys.detail(id) });
    },
    onError: (err: Error) => toast.error(parseDbError(err, "Erro ao salvar a adaptação.")),
  });
}

/**
 * Copy an adaptation into a new row — the safe half of "salvar como nova".
 *
 * Runs from the LIST, not the editor: there is no autosave in flight here, no
 * optimistic token to rebind and no crash mirror in play, so it is a plain
 * INSERT instead of the create-copy-then-roll-the-original-back dance that the
 * same choice would need mid-edit.
 */
export function useDuplicateAdaptation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, title }: { id: string; title: string }) => duplicateAdaptation(id, title),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: adaptationKeys.list() });
      toast.success("Cópia criada.");
    },
    onError: (err: Error) => toast.error(parseDbError(err, "Erro ao duplicar a adaptação.")),
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
