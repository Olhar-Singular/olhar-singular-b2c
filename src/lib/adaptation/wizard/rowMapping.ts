/**
 * Mapping between a persisted AdaptationRow and the in-memory WizardData,
 * used for edit-after-save rehydration and for building a save payload.
 */

import type { AdaptationRow, AdaptationPayload } from "@/lib/adaptation/persistence/adaptationsRepo";
import type { BarrierItem, WizardData } from "@/lib/adaptation/wizard/wizardState";
import { INITIAL_WIZARD_DATA } from "@/lib/adaptation/wizard/wizardState";

/** Rehydrate WizardData from a saved row (edit mode). */
export function rowToWizardData(row: AdaptationRow): WizardData {
  return {
    ...INITIAL_WIZARD_DATA,
    activityType: row.activity_type,
    activityText: row.original_activity,
    barriers: Array.isArray(row.barriers_used)
      ? (row.barriers_used as BarrierItem[])
      : [],
    barrierProfileId: row.barrier_profile_id,
    observationNotes: row.observation_notes ?? undefined,
    result: row.adaptation_result,
  };
}

/** Derive a human title for the saved row from the activity text. */
export function deriveTitle(activityText: string): string {
  const trimmed = activityText.trim();
  if (!trimmed) return "Adaptação sem título";
  const firstLine = trimmed.split("\n")[0];
  return firstLine.length > 80 ? `${firstLine.slice(0, 77)}…` : firstLine;
}

/** Build the insert/update payload from WizardData (result must be present). */
export function wizardDataToPayload(
  data: WizardData,
  userId: string,
): AdaptationPayload {
  /* v8 ignore next -- callers only build a payload once a result exists */
  if (!data.result) throw new Error("cannot build payload without a result");
  // The manual header title (typed on the "Exportar" step) is the source of
  // truth for the row title when present; otherwise we fall back to deriving it
  // from the first line of the activity text.
  return {
    user_id: userId,
    title: data.result.header?.title?.trim() || deriveTitle(data.activityText),
    original_activity: data.activityText,
    activity_type: data.activityType,
    barrier_profile_id: data.barrierProfileId,
    barriers_used: data.barriers,
    observation_notes: data.observationNotes ?? null,
    adaptation_result: data.result,
  };
}
