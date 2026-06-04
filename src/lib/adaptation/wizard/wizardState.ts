/**
 * Wizard state for the canonical adaptation flow.
 *
 * Single source of truth: the canonical document lives at `result.document`.
 * Both editing surfaces (content + styling) mutate that one document, so
 * navigating between them never loses data.
 *
 * These reducers are pure: they never mutate their input and always return a
 * new object (or the same reference when there is nothing to change).
 */

import type { AdaptationResult, CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import type { BarrierItem, SelectedQuestion } from "@/lib/domain/adaptationWizardHelpers";

export type WizardData = {
  activityType: string | null;
  activityText: string;
  selectedQuestions: SelectedQuestion[];
  barriers: BarrierItem[];
  barrierProfileId: string | null;
  observationNotes?: string;
  /** The single source of truth. The canonical document is `result.document`. */
  result: AdaptationResult | null;
};

export const INITIAL_WIZARD_DATA: WizardData = {
  activityType: null,
  activityText: "",
  selectedQuestions: [],
  barriers: [],
  barrierProfileId: null,
  result: null,
};

/** Replace the whole adaptation result (after generate / regenerate). */
export function setResult(data: WizardData, result: AdaptationResult): WizardData {
  return { ...data, result };
}

/** Discard the generated result. */
export function clearResult(data: WizardData): WizardData {
  return { ...data, result: null };
}

/**
 * Replace the canonical document in place while preserving the surrounding
 * result metadata. No-op when there is no result yet.
 */
export function setDocument(data: WizardData, document: CanonicalDocument): WizardData {
  if (!data.result) return data;
  return { ...data, result: { ...data.result, document } };
}
