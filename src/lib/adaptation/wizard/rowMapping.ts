/**
 * Rehydration of a persisted AdaptationRow into the in-memory WizardData.
 *
 * The other direction is gone: the wizard no longer builds an insert payload,
 * because the `adapt-activity` edge function creates the row itself (title
 * derivation now lives there, in _shared/adaptationPersistence.ts). What the
 * client writes afterwards are patches, assembled by the autosave hook.
 */

import type { AdaptationRow } from "@/lib/adaptation/persistence/adaptationsRepo";
import type { BarrierItem, WizardData } from "@/lib/adaptation/wizard/wizardState";
import { INITIAL_WIZARD_DATA } from "@/lib/adaptation/wizard/wizardState";

/**
 * `barriers_used` is written by the edge function from the already-filtered
 * payload (only active barriers survive the filter in StepGenerate), so the
 * column never carries `is_active`. Without this default every rehydrated
 * barrier came back inactive: "Regerar" posted `barriers: []` and took a 400,
 * and Passo 3 falsely claimed the profile had no barriers.
 */
function normalizeBarrier(barrier: BarrierItem): BarrierItem {
  return { ...barrier, is_active: barrier.is_active ?? true };
}

/** Rehydrate WizardData from a saved row (edit mode). */
export function rowToWizardData(row: AdaptationRow): WizardData {
  return {
    ...INITIAL_WIZARD_DATA,
    activityType: row.activity_type,
    activityText: row.original_activity,
    barriers: Array.isArray(row.barriers_used)
      ? (row.barriers_used as BarrierItem[]).map(normalizeBarrier)
      : [],
    barrierProfileId: row.barrier_profile_id,
    observationNotes: row.observation_notes ?? undefined,
    result: row.adaptation_result,
  };
}
