import { describe, it, expect } from "vitest";
import { inspectAdaptationQuality } from "./adaptationQuality";
import { buildAdaptationResult } from "../../../src/lib/adaptation/canonical/ai";

const question = (stem: Array<{ type: string }> = []) => ({ type: "question", stem });
const scaffold = { type: "scaffolding" };

const activity = (
  blocks: Array<{ type: string; stem?: Array<{ type: string }> }>,
  justification = "Reduz a carga de leitura.",
) => ({ document: { blocks }, pedagogical_justification: justification });

// Regression guard for the shape itself. The first version of this module read
// `activity.blocks`, which is never a thing: buildAdaptationResult nests the
// document one level down. Every fixture above is hand-written, so none of them
// could catch that — only feeding the gate something the real builder produced
// can. This test is the reason the fixtures are trustworthy.
describe("shape agreement with buildAdaptationResult", () => {
  const realResult = buildAdaptationResult({
    blocks: [
      {
        type: "question",
        stem: [
          { type: "paragraph", content: [{ type: "text", text: "Quanto é 2+2?" }] },
          { type: "scaffolding", items: ["Some os dois números."] },
        ],
        answer: { kind: "open", answerLines: 2 },
      },
    ],
    strategies_applied: ["Linguagem direta"],
    pedagogical_justification: "Reduz a carga de leitura.",
    implementation_tips: ["Leia em voz alta."],
    // deno-lint-ignore no-explicit-any
  } as any);

  it("reads a real AdaptationResult without throwing", () => {
    expect(() => inspectAdaptationQuality(realResult, 1)).not.toThrow();
  });

  it("finds the questions where the real builder actually puts them", () => {
    // One question in, one expected: a gate that could not see into
    // `document.blocks` would report it as missing.
    expect(inspectAdaptationQuality(realResult, 1)).toEqual([]);
  });

  it("still detects a shortfall on a real AdaptationResult", () => {
    expect(inspectAdaptationQuality(realResult, 4)).toContainEqual({
      code: "missing_questions",
      expected: 4,
      got: 1,
    });
  });
});

describe("inspectAdaptationQuality", () => {
  it("reports nothing for an adaptation that looks healthy", () => {
    const out = inspectAdaptationQuality(
      activity([question([scaffold]), question(), question()]),
      3,
    );
    expect(out).toEqual([]);
  });

  describe("question count", () => {
    it("flags an adaptation that dropped questions", () => {
      const out = inspectAdaptationQuality(activity([question(), question()]), 5);
      expect(out).toContainEqual({ code: "missing_questions", expected: 5, got: 2 });
    });

    it("stays quiet when every question came back", () => {
      const out = inspectAdaptationQuality(activity([question([scaffold]), question(), question()]), 3);
      expect(out.some((s) => s.code === "missing_questions")).toBe(false);
    });

    it("stays quiet when the model returned more questions than expected", () => {
      const out = inspectAdaptationQuality(activity([question([scaffold]), question(), question()]), 2);
      expect(out.some((s) => s.code === "missing_questions")).toBe(false);
    });

    it("skips the check when the caller does not know the expected count", () => {
      const out = inspectAdaptationQuality(activity([question([scaffold])]));
      expect(out.some((s) => s.code === "missing_questions")).toBe(false);
    });

    it("skips the check when the expected count is zero", () => {
      const out = inspectAdaptationQuality(activity([question([scaffold])]), 0);
      expect(out.some((s) => s.code === "missing_questions")).toBe(false);
    });

    it("counts only top-level questions, not blocks nested in a stem", () => {
      // Nested questions are impossible in the AI schema, but the guard must
      // not start counting stem blocks if that ever changes.
      const out = inspectAdaptationQuality(
        activity([question([{ type: "paragraph" }, { type: "paragraph" }])]),
        1,
      );
      expect(out.some((s) => s.code === "missing_questions")).toBe(false);
    });
  });

  describe("scaffolding", () => {
    it("flags an activity of more than two questions with no support anywhere", () => {
      const out = inspectAdaptationQuality(activity([question(), question(), question()]), 3);
      expect(out).toContainEqual({ code: "no_scaffolding", questionCount: 3 });
    });

    it("accepts support nested inside a question stem", () => {
      const out = inspectAdaptationQuality(
        activity([question(), question(), question([scaffold])]),
        3,
      );
      expect(out.some((s) => s.code === "no_scaffolding")).toBe(false);
    });

    it("accepts support sitting at the top level of the document", () => {
      const out = inspectAdaptationQuality(
        activity([scaffold, question(), question(), question()]),
        3,
      );
      expect(out.some((s) => s.code === "no_scaffolding")).toBe(false);
    });

    it("does not demand support from a one- or two-question activity", () => {
      expect(inspectAdaptationQuality(activity([question(), question()]), 2)).toEqual([]);
    });

    it("tolerates a question with no stem field at all", () => {
      const out = inspectAdaptationQuality(activity([{ type: "question" }]), 1);
      expect(out).toEqual([]);
    });
  });

  describe("pedagogical justification", () => {
    it("flags an empty justification", () => {
      const out = inspectAdaptationQuality(activity([question()], ""));
      expect(out).toContainEqual({ code: "empty_justification" });
    });

    it("flags a whitespace-only justification", () => {
      const out = inspectAdaptationQuality(activity([question()], "   \n  "));
      expect(out).toContainEqual({ code: "empty_justification" });
    });

    it("accepts a real justification", () => {
      const out = inspectAdaptationQuality(activity([question()], "Porque reduz a carga."));
      expect(out.some((s) => s.code === "empty_justification")).toBe(false);
    });
  });

  it("reports every problem it finds, not just the first", () => {
    const out = inspectAdaptationQuality(
      activity([question(), question(), question()], ""),
      6,
    );
    expect(out.map((s) => s.code).sort()).toEqual([
      "empty_justification",
      "missing_questions",
      "no_scaffolding",
    ]);
  });
});
