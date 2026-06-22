/**
 * A minimal valid AdaptationResult fixture shared by persistence tests.
 * Mirrors the canonical schema (schemaVersion 1, one paragraph block).
 */

import { SCHEMA_VERSION, type AdaptationResult } from "@/lib/adaptation/canonical/schema";

export const validResult: AdaptationResult = {
  schemaVersion: SCHEMA_VERSION,
  document: {
    schemaVersion: SCHEMA_VERSION,
    blocks: [
      {
        id: "11111111-1111-4111-8111-111111111111",
        type: "paragraph",
        content: [{ type: "text", text: "Olá mundo" }],
      },
    ],
  },
  strategies_applied: ["visual_support"],
  pedagogical_justification: "Justificativa pedagógica.",
  implementation_tips: ["Dica 1"],
};

/** Same as {@link validResult} but carrying a document-level `pageStyle` (plano §7.1). */
export const validResultWithPageStyle: AdaptationResult = {
  ...validResult,
  pageStyle: { fontFamily: "lexend", fontSize: 14, blockSpacing: 24 },
};
