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

import type { AdaptationResult, CanonicalDocument, PageStyle } from "@/lib/adaptation/canonical/schema";

export type BarrierItem = {
  dimension: string;
  barrier_key: string;
  label: string;
  is_active: boolean;
  notes?: string;
};

export type SelectedQuestion = {
  id: string;
  text: string;
  image_url: string | null;
  options: string[] | null;
  subject: string;
  topic: string | null;
  difficulty: string | null;
};

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

/**
 * Set the document-wide presentation style (plano §7.1), preserving the document
 * and the surrounding metadata. No-op when there is no result yet.
 */
export function setPageStyle(data: WizardData, pageStyle: PageStyle): WizardData {
  if (!data.result) return data;
  return { ...data, result: { ...data.result, pageStyle } };
}
