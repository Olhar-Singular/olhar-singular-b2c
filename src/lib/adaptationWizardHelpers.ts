import type { StructuredActivity, StructuredAdaptationResult } from "@/types/adaptation";
import { markdownDslToStructured } from "@/lib/activityDslConverter";

export type AdaptationResult = StructuredAdaptationResult;

export type WizardMode = "ai" | "manual";

export type EditorContent = { dsl: string; registry: Record<string, string> };

export type BarrierItem = {
  dimension: string;
  barrier_key: string;
  label: string;
  is_active: boolean;
  notes?: string;
};

export type WizardData = {
  activityType: string | null;
  activityText: string;
  barriers: BarrierItem[];
  barrierProfileId: string | null;
  observationNotes?: string;
  result: AdaptationResult | null;
  wizardMode: WizardMode;
  editorContentUniversal?: EditorContent;
  editorContentDirected?: EditorContent;
  editorContentManual?: EditorContent;
};

export function resetGeneratedState(): Partial<WizardData> {
  return {
    result: null,
    editorContentUniversal: undefined,
    editorContentDirected: undefined,
    editorContentManual: undefined,
  };
}

export function buildManualResult(activity: StructuredActivity): AdaptationResult {
  return {
    version_universal: activity,
    version_directed: structuredClone(activity),
    strategies_applied: [],
    pedagogical_justification: "Atividade editada manualmente pelo professor.",
    implementation_tips: [],
  };
}

export function shouldConfirmDiscard(
  steps: readonly string[],
  currentStep: number,
  target: number,
  hasResult: boolean,
): boolean {
  if (!hasResult) return false;
  const editorIndex = Math.max(
    steps.indexOf("ai_editor"),
    steps.indexOf("editor"),
  );
  if (editorIndex === -1) return false;
  return currentStep >= editorIndex && target < editorIndex;
}

export function buildAIEditorAdvancePatch(
  universalDsl: string,
  directedDsl: string,
  prevResult: AdaptationResult | null,
): Partial<WizardData> {
  const parsedUniversal = markdownDslToStructured(universalDsl);
  const parsedDirected = markdownDslToStructured(directedDsl);

  return {
    result: {
      strategies_applied: prevResult?.strategies_applied ?? [],
      pedagogical_justification: prevResult?.pedagogical_justification ?? "",
      implementation_tips: prevResult?.implementation_tips ?? [],
      version_universal: parsedUniversal,
      version_directed: parsedDirected,
    },
  };
}

export function buildManualEditorAdvancePatch(
  dsl: string,
  prevResult: AdaptationResult | null,
): Partial<WizardData> {
  const updated = markdownDslToStructured(dsl);
  return {
    result: {
      strategies_applied: prevResult?.strategies_applied ?? [],
      pedagogical_justification: prevResult?.pedagogical_justification ?? "Atividade editada manualmente pelo professor.",
      implementation_tips: prevResult?.implementation_tips ?? [],
      version_universal: updated,
      version_directed: structuredClone(updated),
    },
  };
}
