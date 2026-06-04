import { describe, it, expect } from "vitest";
import { rowToWizardData, deriveTitle, wizardDataToPayload } from "./rowMapping";
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
  });

  it("defaults barriers to [] when barriers_used is not an array", () => {
    const data = rowToWizardData({ ...ROW, barriers_used: null });
    expect(data.barriers).toEqual([]);
  });
});

describe("deriveTitle", () => {
  it("uses the first line of the activity text", () => {
    expect(deriveTitle("Primeira linha\nsegunda")).toBe("Primeira linha");
  });

  it("falls back to a placeholder when empty", () => {
    expect(deriveTitle("   ")).toBe("Adaptação sem título");
  });

  it("truncates very long first lines", () => {
    const long = "a".repeat(120);
    const title = deriveTitle(long);
    expect(title.length).toBe(78);
    expect(title.endsWith("…")).toBe(true);
  });
});

describe("wizardDataToPayload", () => {
  it("builds an insert payload from wizard data", () => {
    const data = {
      ...INITIAL_WIZARD_DATA,
      activityType: "prova",
      activityText: "Texto da atividade",
      barrierProfileId: "bp1",
      barriers: [],
      result: validResult,
    };
    const payload = wizardDataToPayload(data, "u1");
    expect(payload).toEqual({
      user_id: "u1",
      title: "Texto da atividade",
      original_activity: "Texto da atividade",
      activity_type: "prova",
      barrier_profile_id: "bp1",
      barriers_used: [],
      adaptation_result: validResult,
    });
  });
});
