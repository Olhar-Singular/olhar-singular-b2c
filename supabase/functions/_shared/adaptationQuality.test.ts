import { describe, it, expect } from "vitest";
import { inspectAdaptationQuality } from "./adaptationQuality";

const question = (stem: Array<{ type: string }> = []) => ({ type: "question", stem });
const scaffold = { type: "scaffolding" };

const activity = (
  blocks: Array<{ type: string; stem?: Array<{ type: string }> }>,
  justification = "Reduz a carga de leitura.",
) => ({ blocks, pedagogical_justification: justification });

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
