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
  /** Force an immediate flush of any pending edit (e.g. before navigating). */
  flush: () => Promise<void>;
  /** Read the crash mirror for this draft, if any. */
  restoreFromMirror: () => Promise<AdaptationResult | null>;
};

export function useAdaptationDraft({
  draftId,
  result,
  initialUpdatedAt,
  onConflict,
  debounceMs = AUTOSAVE_DEBOUNCE_MS,
}: UseAdaptationDraftOptions): UseAdaptationDraftResult {
  const [status, setStatus] = useState<SaveStatus>("idle");

  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
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

  /** Run one save now (no debounce). No-op when nothing to persist / not dirty. */
  const performSave = useCallback(async () => {
    const id = draftIdRef.current;
    const current = resultRef.current;
    const expected = expectedUpdatedAtRef.current;
    if (!id || !current || !expected) return;
    if (!isDirty(current, lastSavedRef.current)) return;

    setStatus("saving");
    // Crash mirror first: if the network save fails, the edit survives.
    await writeMirror(id, current);

    try {
      const res = await updateAdaptation(id, { adaptation_result: current }, expected);
      if (res.ok) {
        lastSavedRef.current = serializeResult(current);
        expectedUpdatedAtRef.current = res.row.updated_at;
        await clearMirror(id);
        setStatus(nextStatusAfterSave("success"));
        return;
      }
      setStatus(nextStatusAfterSave("conflict"));
      onConflictRef.current?.();
    } catch {
      setStatus(nextStatusAfterSave("error"));
    }
  }, []);

  const flush = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    await performSave();
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

  return { status, flush, restoreFromMirror };
}
