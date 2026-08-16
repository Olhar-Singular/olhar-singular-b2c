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

/**
 * The result of a forced flush.
 *
 * It is a RESULT, not a token, on purpose: `flush` used to hand back the
 * current `updated_at` even when the save had just failed, so "Salvar" happily
 * marked the row ready over edits that never left the browser — and the
 * server-side `updated_at` bump then made the surviving crash mirror look
 * stale, so the next open discarded it. Losing the edit twice over.
 *
 * The discriminant is a STRING, not a boolean: this project compiles with
 * `strictNullChecks: false`, under which TypeScript does not narrow a union by
 * a `true`/`false` literal — a boolean `ok` would type-check the failure branch
 * as if it were the success one, which is precisely the confusion this type
 * exists to prevent.
 */
export type FlushOutcome =
  | { status: "saved"; updatedAt: string | null }
  | { status: "failed"; reason: "error" | "conflict" };

export type UseAdaptationDraftResult = {
  status: SaveStatus;
  /**
   * Force an immediate flush of any pending edit (e.g. before navigating).
   * Resolves with the freshest known `updated_at` AFTER a successful flush — so
   * a caller that flushes-then-markReady uses the token the flush itself
   * produced, not a stale render-time value — or with a failure the caller MUST
   * honour instead of proceeding.
   */
  flush: () => Promise<FlushOutcome>;
  /** Read the crash mirror for this draft, if any. */
  restoreFromMirror: () => Promise<AdaptationResult | null>;
  /**
   * The latest known `updated_at` for the draft row — advanced after every
   * successful autosave. The caller passes this to `markReady` so the
   * optimistic-concurrency token never goes stale.
   */
  currentUpdatedAt: string | null;
  /**
   * Adopt an `updated_at` produced by a write OUTSIDE the autosave path.
   * `markReady` is such a write: it flips `status` and the BEFORE UPDATE
   * trigger stamps a new `updated_at`, so without this the next keystroke
   * autosaves against a token the server has already moved past.
   */
  syncUpdatedAt: (updatedAt: string) => void;
};

/** What one save attempt did — drives both the status indicator and `flush`. */
type SaveOutcome = "clean" | "success" | "conflict" | "error";

/** Snapshot of an in-flight save, so overlapping callers can join it. */
type InFlightSave = { promise: Promise<SaveOutcome>; snapshot: string };

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
  // Which draft the token above actually belongs to. `updated_at` is a per-ROW
  // value, so this pairing is what keeps it honest across draft changes.
  const tokenDraftIdRef = useRef<string | null>(draftId);
  // Always read the latest values inside async callbacks without re-binding.
  const resultRef = useRef(result);
  const draftIdRef = useRef(draftId);
  const onConflictRef = useRef(onConflict);
  resultRef.current = result;
  draftIdRef.current = draftId;
  onConflictRef.current = onConflict;

  // Bind the optimistic token to the draft it describes.
  //
  // The token is a PER-ROW value, and the previous rule ("adopt it only while
  // the ref is still null") quietly assumed there would only ever be one row
  // per mount. "Nova adaptação" breaks that: the wizard clears the draft and a
  // new generation hands over a different row, while the token still held the
  // previous row's `updated_at`. The new draft's very first autosave was then
  // checked against a foreign timestamp, came back as a conflict, and the
  // wizard answered with navigate(0) — discarding work that was never at risk.
  //
  // Keying the rebind on the draft id instead makes the pairing explicit: a
  // different row means a different token, always. `lastSavedRef` is cleared
  // with it because nothing has been written to THIS row from here yet.
  //
  // The id and its timestamp always arrive together (both are set in the same
  // state update when a generation lands, or seeded together in edit mode), so
  // there is no separate "the timestamp showed up later" case to handle.
  useEffect(() => {
    if (draftId === tokenDraftIdRef.current) return;
    tokenDraftIdRef.current = draftId;
    expectedUpdatedAtRef.current = initialUpdatedAt;
    setCurrentUpdatedAt(initialUpdatedAt);
    lastSavedRef.current = null;
  }, [draftId, initialUpdatedAt]);

  const syncUpdatedAt = useCallback((updatedAt: string) => {
    expectedUpdatedAtRef.current = updatedAt;
    setCurrentUpdatedAt(updatedAt);
  }, []);

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
  const runSave = useCallback(async (): Promise<SaveOutcome> => {
    const id = draftIdRef.current;
    const current = resultRef.current;
    const expected = expectedUpdatedAtRef.current;
    if (!id || !current || !expected) return "clean";
    if (!isDirty(current, lastSavedRef.current)) return "clean";

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
        // Only NOW is it safe to drop the local copy.
        await clearMirror(id);
        transition(nextStatusAfterSave("success"));
        return "success";
      }
      transition(nextStatusAfterSave("conflict"));
      onConflictRef.current?.();
      return "conflict";
    } catch {
      transition(nextStatusAfterSave("error"));
      return "error";
    }
  }, [transition]);

  /**
   * Serialize saves. Two writers may not race on the optimistic token: it is a
   * per-row value that the FIRST successful UPDATE moves, so a second UPDATE
   * still holding the old one matches 0 rows and comes back as a conflict — a
   * conflict with nobody. Switching tabs fired exactly that: the browser emits
   * `blur` AND `visibilitychange` in the same tick, both flush, and the wizard
   * answered the phantom conflict with a toast and `navigate(0)`, reloading the
   * page out from under a user who had done nothing wrong.
   *
   * A caller arriving while a save is in flight JOINS it when that save already
   * covers the current state (same serialized result), and otherwise waits and
   * then runs its own — so an edit made mid-flight is never dropped.
   */
  const inFlightRef = useRef<InFlightSave | null>(null);

  const performSave = useCallback((): Promise<SaveOutcome> => {
    const current = resultRef.current;
    const snapshot = current ? serializeResult(current) : "";

    const previous = inFlightRef.current;
    // The in-flight save already carries this exact state: its outcome is ours.
    if (previous?.snapshot === snapshot) return previous.promise;

    // Otherwise QUEUE behind it rather than racing it. `runSave` then reads the
    // freshest result and the token the previous write produced, so a keystroke
    // made mid-flight is written on top of that write instead of against a
    // timestamp the server has already moved past.
    const promise = (async () => {
      if (previous) await previous.promise.catch(() => undefined);
      return runSave();
    })();
    inFlightRef.current = { promise, snapshot };
    // Clear the slot only if a newer save has not already claimed it.
    return promise.finally(() => {
      if (inFlightRef.current?.promise === promise) inFlightRef.current = null;
    });
  }, [runSave]);

  const flush = useCallback(async (): Promise<FlushOutcome> => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    const outcome = await performSave();
    if (outcome === "conflict" || outcome === "error") {
      return { status: "failed", reason: outcome };
    }
    return { status: "saved", updatedAt: expectedUpdatedAtRef.current };
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

  return { status, flush, restoreFromMirror, currentUpdatedAt, syncUpdatedAt };
}
