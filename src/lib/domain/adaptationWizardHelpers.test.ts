import { describe, it, expect, vi } from "vitest";
import {
  resetGeneratedState,
  buildManualResult,
  shouldConfirmDiscard,
  buildAIEditorAdvancePatch,
  buildManualEditorAdvancePatch,
} from "./adaptationWizardHelpers";
import type { StructuredActivity } from "@/types/adaptation";

vi.mock("@/lib/domain/activityDslConverter", () => ({
  markdownDslToStructured: vi.fn((dsl: string) => ({
    sections: [{ title: dsl, questions: [] }],
  })),
}));

const ACTIVITY: StructuredActivity = {
  sections: [{ title: "S", questions: [] }],
};

describe("resetGeneratedState", () => {
  it("returns nullish values for all generated editor fields", () => {
    expect(resetGeneratedState()).toEqual({
      result: null,
      editorContentUniversal: undefined,
      editorContentDirected: undefined,
      editorContentManual: undefined,
    });
  });
});

describe("buildManualResult", () => {
  it("clones the activity into both versions and includes default justification", () => {
    const result = buildManualResult(ACTIVITY);
    expect(result.version_universal).toEqual(ACTIVITY);
    expect(result.version_directed).toEqual(ACTIVITY);
    expect(result.version_directed).not.toBe(ACTIVITY);
    expect(result.strategies_applied).toEqual([]);
    expect(result.implementation_tips).toEqual([]);
    expect(result.pedagogical_justification).toMatch(/manualmente/i);
  });
});

describe("shouldConfirmDiscard", () => {
  const STEPS = ["start", "barriers", "ai_editor", "export"] as const;

  it("returns false when there is no result yet", () => {
    expect(shouldConfirmDiscard(STEPS, 3, 0, false)).toBe(false);
  });

  it("returns false when no editor step is in the steps list", () => {
    const noEditor = ["start", "barriers", "export"];
    expect(shouldConfirmDiscard(noEditor, 2, 0, true)).toBe(false);
  });

  it("returns true when navigating from past-editor back to before editor", () => {
    expect(shouldConfirmDiscard(STEPS, 3, 1, true)).toBe(true);
  });

  it("returns false when navigating forward (no discard)", () => {
    expect(shouldConfirmDiscard(STEPS, 0, 1, true)).toBe(false);
  });

  it("returns false when current is before editor", () => {
    expect(shouldConfirmDiscard(STEPS, 1, 0, true)).toBe(false);
  });

  it("supports the legacy 'editor' step name", () => {
    const legacy = ["start", "barriers", "editor", "export"] as const;
    expect(shouldConfirmDiscard(legacy, 3, 1, true)).toBe(true);
  });
});

describe("buildAIEditorAdvancePatch", () => {
  it("parses both DSLs and preserves prevResult metadata", () => {
    const prev = {
      strategies_applied: ["s1"],
      pedagogical_justification: "pj",
      implementation_tips: ["t1"],
      version_universal: ACTIVITY,
      version_directed: ACTIVITY,
    };
    const patch = buildAIEditorAdvancePatch("u", "d", prev);
    expect(patch.result?.strategies_applied).toEqual(["s1"]);
    expect(patch.result?.pedagogical_justification).toBe("pj");
    expect(patch.result?.implementation_tips).toEqual(["t1"]);
    expect(patch.result?.version_universal.sections[0].title).toBe("u");
    expect(patch.result?.version_directed.sections[0].title).toBe("d");
  });

  it("falls back to empty metadata when prevResult is null", () => {
    const patch = buildAIEditorAdvancePatch("u", "d", null);
    expect(patch.result?.strategies_applied).toEqual([]);
    expect(patch.result?.pedagogical_justification).toBe("");
    expect(patch.result?.implementation_tips).toEqual([]);
  });
});

describe("buildManualEditorAdvancePatch", () => {
  it("clones parsed DSL into both versions and falls back to manual justification", () => {
    const patch = buildManualEditorAdvancePatch("manual-dsl", null);
    expect(patch.result?.version_universal.sections[0].title).toBe("manual-dsl");
    expect(patch.result?.version_directed).toEqual(patch.result?.version_universal);
    expect(patch.result?.version_directed).not.toBe(patch.result?.version_universal);
    expect(patch.result?.pedagogical_justification).toMatch(/manualmente/i);
  });

  it("preserves prevResult metadata if present", () => {
    const prev = {
      strategies_applied: ["x"],
      pedagogical_justification: "kept",
      implementation_tips: ["y"],
      version_universal: ACTIVITY,
      version_directed: ACTIVITY,
    };
    const patch = buildManualEditorAdvancePatch("dsl", prev);
    expect(patch.result?.strategies_applied).toEqual(["x"]);
    expect(patch.result?.pedagogical_justification).toBe("kept");
    expect(patch.result?.implementation_tips).toEqual(["y"]);
  });
});
