import { describe, it, expect } from "vitest";
import { QuestionAnswer } from "./schema";
import { newId } from "./ids";

const validId = () => newId();
const textContent = [{ type: "text" as const, text: "content" }];

describe("QuestionAnswer — open", () => {
  it("accepts minimal open answer", () => {
    expect(QuestionAnswer.safeParse({ kind: "open" }).success).toBe(true);
  });

  it("accepts open with answerLines", () => {
    expect(
      QuestionAnswer.safeParse({ kind: "open", answerLines: 5 }).success
    ).toBe(true);
  });

  it("rejects open with non-positive answerLines", () => {
    expect(
      QuestionAnswer.safeParse({ kind: "open", answerLines: 0 }).success
    ).toBe(false);
  });
});

describe("QuestionAnswer — multipleChoice", () => {
  it("accepts exactly one correct alternative", () => {
    const result = QuestionAnswer.safeParse({
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
    const result = QuestionAnswer.safeParse({
      kind: "multipleChoice",
      alternatives: [
        { id: validId(), content: textContent, correct: false },
        { id: validId(), content: textContent, correct: false },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects two correct alternatives", () => {
    const result = QuestionAnswer.safeParse({
      kind: "multipleChoice",
      alternatives: [
        { id: validId(), content: textContent, correct: true },
        { id: validId(), content: textContent, correct: true },
      ],
    });
    expect(result.success).toBe(false);
  });

  it("rejects empty alternatives array", () => {
    const result = QuestionAnswer.safeParse({
      kind: "multipleChoice",
      alternatives: [],
    });
    expect(result.success).toBe(false);
  });

  it("rejects alternative with invalid id", () => {
    const result = QuestionAnswer.safeParse({
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
    const result = QuestionAnswer.safeParse({
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
    const result = QuestionAnswer.safeParse({
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
    const result = QuestionAnswer.safeParse({
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
    const result = QuestionAnswer.safeParse({
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
    const result = QuestionAnswer.safeParse({
      kind: "fillBlank",
      gaps: [
        { id: validId(), answer: "Paris", alternatives: ["paris"], tip: "Capital of France" },
      ],
    });
    expect(result.success).toBe(true);
  });

  it("accepts fillBlank gap without optional fields", () => {
    const result = QuestionAnswer.safeParse({
      kind: "fillBlank",
      gaps: [{ id: validId(), answer: "Paris" }],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — table", () => {
  it("accepts table rows", () => {
    const result = QuestionAnswer.safeParse({
      kind: "table",
      rows: [[textContent, textContent], [textContent, textContent]],
    });
    expect(result.success).toBe(true);
  });
});

describe("QuestionAnswer — unknown kind", () => {
  it("rejects unknown kind", () => {
    const result = QuestionAnswer.safeParse({
      kind: "unknown",
      data: "whatever",
    });
    expect(result.success).toBe(false);
  });
});
