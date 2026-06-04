/**
 * Pure decision helpers for the autosave hook.
 *
 * Kept side-effect-free so the dirty-check and status logic are unit-tested in
 * isolation; the hook (useAdaptationDraft) wires them to timers and the repo.
 */

import type { AdaptationResult } from "@/lib/adaptation/canonical/schema";

export type SaveStatus = "idle" | "saving" | "saved" | "error" | "conflict";

/** Default debounce window for autosave, in ms. */
export const AUTOSAVE_DEBOUNCE_MS = 1200;

/**
 * Stable serialization of a result for dirty-checking. JSON key order is
 * preserved across our pure reducers (they spread), so a string compare is a
 * reliable, cheap "did anything change" signal.
 */
export function serializeResult(result: AdaptationResult): string {
  return JSON.stringify(result);
}

/**
 * Decide whether a pending edit actually needs to be persisted.
 * Returns true only when the serialized snapshot differs from the last-saved one.
 */
export function isDirty(current: AdaptationResult, lastSaved: string | null): boolean {
  if (lastSaved === null) return true;
  return serializeResult(current) !== lastSaved;
}

/**
 * Map the outcome of a save attempt to the next status indicator value.
 * A conflict is surfaced distinctly so the caller can warn + reload.
 */
export function nextStatusAfterSave(
  outcome: "success" | "conflict" | "error",
): SaveStatus {
  if (outcome === "success") return "saved";
  if (outcome === "conflict") return "conflict";
  return "error";
}
