import { describe, it, expect } from "vitest";
import { QuestionAnswerSchema } from "./schema";
import { newId } from "./ids";

const validId = () => newId();
const textContent = [{ type: "text" as const, text: "content" }];

describe("QuestionAnswer — open", () => {
  it("accepts minimal open answer", () => {
    expect(QuestionAnswerSchema.safeParse({ kind: "open" }).success).toBe(true);
  });

  it("accepts open with answerLines", () => {
    expect(
      QuestionAnswerSchema.safeParse({ kind: "open", answerLines: 5 }).success
    ).toBe(true);
  });

  it("rejects open with non-positive answerLines", () => {
    expect(
      QuestionAnswerSchema.safeParse({ kind: "open", answerLines: 0 }).success
    ).toBe(false);
  });
});

describe("QuestionAnswer — multipleChoice", () => {
  it("accepts exactly one correct alternative", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "multipleChoice",
      alternatives: [
        { id: validId(), content: textContent, correct: true },
        { id: validId(), content: textContent, correct: false },
        { id: validId(), content: textContent, correct: false },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("rejects zero correct alternatives", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "multipleChoice",
      alternatives: [
        { id: validId(), content: textContent, correct: false },
        { id: validId(), content: textContent, correct: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects two correct alternatives", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "multipleChoice",
      alternatives: [
        { id: validId(), content: textContent, correct: true },
        { id: validId(), content: textContent, correct: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty alternatives array", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "multipleChoice",
      alternatives: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects alternative with invalid id", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "multipleChoice",
      alternatives: [
        { id: "not-a-uuid", content: textContent, correct: true },
      ],
    });
    expect(result.success).toBe(false);
  });
});

describe("QuestionAnswer — trueFalse", () => {
  it("accepts trueFalse items", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "trueFalse",
      items: [
        { id: validId(), content: textContent, value: true },
        { id: validId(), content: textContent, value: false },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — checkbox", () => {
  it("accepts checkbox items", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "checkbox",
      items: [
        { id: validId(), content: textContent, checked: true },
        { id: validId(), content: textContent, checked: false },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — matching", () => {
  it("accepts matching pairs", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "matching",
      pairs: [
        { id: validId(), left: textContent, right: textContent },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — ordering", () => {
  it("accepts ordering items", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "ordering",
      items: [
        { id: validId(), content: textContent, position: 1 },
        { id: validId(), content: textContent, position: 2 },
      ],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — fillBlank", () => {
  it("accepts fillBlank gaps", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "fillBlank",
      gaps: [
        { id: validId(), answer: "Paris", alternatives: ["paris"], tip: "Capital of France" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts fillBlank gap without optional fields", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "fillBlank",
      gaps: [{ id: validId(), answer: "Paris" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — table", () => {
  it("accepts table rows", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "table",
      rows: [[textContent, textContent], [textContent, textContent]],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — unknown kind", () => {
  it("rejects unknown kind", () => {
    const result = QuestionAnswerSchema.safeParse({
      kind: "unknown",
      data: "whatever",
    });
    expect(result.success).toBe(false);
  });
});
