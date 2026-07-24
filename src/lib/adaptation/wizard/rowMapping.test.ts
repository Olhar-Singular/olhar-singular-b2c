import { describe, it, expect } from "vitest";
import { rowToWizardData } from "./rowMapping";
import { INITIAL_WIZARD_DATA } from "./wizardState";
import { validResult } from "@/lib/adaptation/persistence/__fixtures__/result";
import type { AdaptationRow } from "@/lib/adaptation/persistence/adaptationsRepo";

const ROW: AdaptationRow = {
  id: "a1",
  user_id: "u1",
  barrier_profile_id: "bp1",
  title: "T",
  original_activity: "Atividade de frações\nlinha 2",
  activity_type: "prova",
  barriers_used: [
    { dimension: "tea", barrier_key: "abstracao", label: "Abstração", is_active: true },
  ],
  observation_notes: "Notas do professor",
  adaptation_result: validResult,
  status: "draft",
  credits_spent: 0,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

describe("rowToWizardData", () => {
  it("rehydrates wizard data from a saved row", () => {
    const data = rowToWizardData(ROW);
    expect(data.activityType).toBe("prova");
    expect(data.activityText).toBe("Atividade de frações\nlinha 2");
    expect(data.barrierProfileId).toBe("bp1");
    expect(data.barriers).toHaveLength(1);
    expect(data.result).toEqual(validResult);
    expect(data.observationNotes).toBe("Notas do professor");
  });

  it("defaults barriers to [] when barriers_used is not an array", () => {
    const data = rowToWizardData({ ...ROW, barriers_used: null });
    expect(data.barriers).toEqual([]);
  });

  it("rehydrates observationNotes as undefined when the column is null", () => {
    const data = rowToWizardData({ ...ROW, observation_notes: null });
    expect(data.observationNotes).toBeUndefined();
  });
});
