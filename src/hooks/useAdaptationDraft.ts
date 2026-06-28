/**
 * Autosave hook for the canonical adaptation draft.
 *
 * Debounced (~1200ms) persistence of the wizard `result` (incl. its canonical
 * `document`) to the draft row. Both editing surfaces — content AND styling —
 * mutate `result.document`, so wiring this hook to `result` autosaves every
 * step of text AND style editing (Q-persist).
 *
 * Guarantees:
 *   - status indicator: idle | saving | saved | error | conflict
 *   - flush on unmount, window blur, and visibilitychange→hidden
 *   - crash mirror (IndexedDB / localStorage) written before each save and
 *     cleared once the server save lands; `restoreFromMirror` reads it back
 *   - optimistic concurrency via the repo: a stale updated_at → status
 *     "conflict", and `onConflict` is fired so the caller can warn + reload
 *
 * The debounce + dirty-check decision logic lives in pure helpers
 * (autosaveDecision.ts); this hook only wires them to timers and the repo.
 */

import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { updateAdaptation } from "@/lib/adaptation/persistence/adaptationsRepo";
import {
  writeMirror,
  clearMirror,
  readMirror,
} from "@/lib/adaptation/persistence/draftMirror";
import {
  AUTOSAVE_DEBOUNCE_MS,
  isDirty,
  serializeResult,
  nextStatusAfterSave,
  type SaveStatus,
} from "@/lib/adaptation/persistence/autosaveDecision";
import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";

export type UseAdaptationDraftOptions = {
  /** The draft row id (created by the wizard on first generation). */
  draftId: string | null;
  /** The live wizard result; null until the first generation. */
  result: AdaptationResult | null;
  /** The row's updated_at at mount; the hook advances it after each save. */
  initialUpdatedAt: string | null;
  /** Fired when a save hits an optimistic-concurrency conflict. */
  onConflict?: () => void;
  /** Override the debounce window (tests). */
  debounceMs?: number;
};

export type UseAdaptationDraftResult = {
  status: SaveStatus;
  /**
   * Force an immediate flush of any pending edit (e.g. before navigating).
   * Resolves with the freshest known `updated_at` AFTER the flush — so a caller
   * that flushes-then-markReady uses the token the flush itself produced, not a
   * stale render-time value.
   */
  flush: () => Promise<string | null>;
  /** Read the crash mirror for this draft, if any. */
  restoreFromMirror: () => Promise<AdaptationResult | null>;
  /**
   * The latest known `updated_at` for the draft row — advanced after every
   * successful autosave. The caller passes this to `markReady` so the
   * optimistic-concurrency token never goes stale.
   */
  currentUpdatedAt: string | null;
};

export function useAdaptationDraft({
  draftId,
  result,
  initialUpdatedAt,
  onConflict,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
}: UseAdaptationDraftOptions): UseAdaptationDraftResult {
  const [status, setStatus] = useState<SaveStatus>("idle");
  // Mirror of the optimistic token in state so the wizard can read the latest
  // value (e.g. to pass into markReady). The ref drives the save path; the
  // state drives the render-visible value — they advance together.
  const [currentUpdatedAt, setCurrentUpdatedAt] = useState<string | null>(initialUpdatedAt);

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Whether we have already toasted for the current error streak. Set on the
  // first failure, cleared on any non-error terminal outcome (success/conflict),
  // so the user is told once per error episode — not on every failed retry.
  const errorToastedRef = useRef(false);
  const lastSavedRef = useRef<string | null>(
    result ? serializeResult(result) : null,
  );
  const expectedUpdatedAtRef = useRef<string | null>(initialUpdatedAt);
  // Always read the latest values inside async callbacks without re-binding.
  const resultRef = useRef(result);
  const draftIdRef = useRef(draftId);
  const onConflictRef = useRef(onConflict);
  resultRef.current = result;
  draftIdRef.current = draftId;
  onConflictRef.current = onConflict;

  // CREATE flow: the draft is born after mount, so `initialUpdatedAt` arrives
  // as a later prop. Adopt it once — but never clobber a fresher value already
  // advanced by a successful save (only sync while the ref is still null).
  useEffect(() => {
    if (initialUpdatedAt && expectedUpdatedAtRef.current === null) {
      expectedUpdatedAtRef.current = initialUpdatedAt;
      setCurrentUpdatedAt(initialUpdatedAt);
    }
  }, [initialUpdatedAt]);

  /**
   * Move to a new status, firing the autosave-failure toast exactly once per
   * error episode (a user may navigate away mid-error and lose sight of the
   * status indicator — the crash mirror keeps the edit, so we reassure). The
   * toast is suppressed on subsequent failed retries and re-armed once a save
   * recovers (any non-error terminal status).
   */
  const transition = useCallback((next: SaveStatus) => {
    if (next === "error") {
      if (!errorToastedRef.current) {
        errorToastedRef.current = true;
        toast.error(
          "Não foi possível salvar automaticamente. Suas alterações estão guardadas localmente.",
        );
      }
    } else if (next === "saved" || next === "conflict") {
      errorToastedRef.current = false;
    }
    setStatus(next);
  }, []);

  /** Run one save now (no debounce). No-op when nothing to persist / not dirty. */
  const performSave = useCallback(async () => {
    const id = draftIdRef.current;
    const current = resultRef.current;
    const expected = expectedUpdatedAtRef.current;
    if (!id || !current || !expected) return;
    if (!isDirty(current, lastSavedRef.current)) return;

    transition("saving");
    // Crash mirror first: if the network save fails, the edit survives.
    await writeMirror(id, current);

    try {
      // Keep the `title` column in sync with the manual header title so the
      // history list (which reads the column, not the result blob) reflects an
      // edited title live. When no manual title is set we leave the column as-is
      // (it keeps the value derived from the activity text at insert time).
      const manualTitle = current.header?.title?.trim();
      const patch = manualTitle
        ? { adaptation_result: current, title: manualTitle }
        : { adaptation_result: current };
      const res = await updateAdaptation(id, patch, expected);
      if (res.ok) {
        lastSavedRef.current = serializeResult(current);
        expectedUpdatedAtRef.current = res.row.updated_at;
        setCurrentUpdatedAt(res.row.updated_at);
        await clearMirror(id);
        transition(nextStatusAfterSave("success"));
        return;
      }
      transition(nextStatusAfterSave("conflict"));
      onConflictRef.current?.();
    } catch {
      transition(nextStatusAfterSave("error"));
    }
  }, [transition]);

  const flush = useCallback(async (): Promise<string | null> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave();
    return expectedUpdatedAtRef.current;
  }, [performSave]);

  const restoreFromMirror = useCallback(async () => {
    const id = draftIdRef.current;
    if (!id) return null;
    const entry = await readMirror(id);
    return entry?.result ?? null;
  }, []);

  // Debounced autosave whenever the result changes.
  const resultKey = result ? serializeResult(result) : null;
  useEffect(() => {
    if (!draftId || !resultKey) return;
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      timerRef.current = null;
      void performSave();
    }, debounceMs);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [draftId, resultKey, debounceMs, performSave]);

  // Flush on blur, tab-hide, and unmount so no edit is lost.
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => {
    const onBlur = () => void flushRef.current();
    const onVisibility = () => {
      if (document.visibilityState === "hidden") void flushRef.current();
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      window.removeEventListener("blur", onBlur);
      document.removeEventListener("visibilitychange", onVisibility);
      void flushRef.current();
    };
  }, []);

  return { status, flush, restoreFromMirror, currentUpdatedAt };
}
