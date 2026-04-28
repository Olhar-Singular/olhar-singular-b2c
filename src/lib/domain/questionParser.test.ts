import { describe, it, expect } from "vitest";
import { validateExtractedQuestions } from "./questionParser";

describe("validateExtractedQuestions", () => {
  it("returns empty array for non-array input", () => {
    expect(validateExtractedQuestions(null)).toEqual([]);
    expect(validateExtractedQuestions(undefined)).toEqual([]);
    expect(validateExtractedQuestions("string")).toEqual([]);
    expect(validateExtractedQuestions({})).toEqual([]);
  });

  it("returns empty array for empty array", () => {
    expect(validateExtractedQuestions([])).toEqual([]);
  });

  it("filters out items missing required text", () => {
    const input = [{ text: "", subject: "Física" }];
    expect(validateExtractedQuestions(input)).toEqual([]);
  });

  it("filters out items missing required subject", () => {
    const input = [{ text: "Enunciado", subject: "" }];
    expect(validateExtractedQuestions(input)).toEqual([]);
  });

  it("filters out items with missing fields entirely", () => {
    const input = [{ text: "Enunciado" }]; // no subject
    expect(validateExtractedQuestions(input)).toEqual([]);
  });

  it("trims text and subject", () => {
    const input = [{ text: "  Enunciado  ", subject: "  Física  " }];
    const result = validateExtractedQuestions(input);
    expect(result[0].text).toBe("Enunciado");
    expect(result[0].subject).toBe("Física");
  });

  it("passes valid question with all required fields", () => {
    const input = [{ text: "Q1", subject: "Matemática" }];
    const result = validateExtractedQuestions(input);
    expect(result).toHaveLength(1);
    expect(result[0].text).toBe("Q1");
    expect(result[0].subject).toBe("Matemática");
  });

  it("maps optional options array", () => {
    const input = [{ text: "Q1", subject: "Física", options: ["A", "B", "C"] }];
    const result = validateExtractedQuestions(input);
    expect(result[0].options).toEqual(["A", "B", "C"]);
  });

  it("sets options to undefined when not an array", () => {
    const input = [{ text: "Q1", subject: "Física", options: "not array" }];
    const result = validateExtractedQuestions(input);
    expect(result[0].options).toBeUndefined();
  });

  it("maps correct_answer when numeric", () => {
    const input = [{ text: "Q1", subject: "Física", correct_answer: 2 }];
    const result = validateExtractedQuestions(input);
    expect(result[0].correct_answer).toBe(2);
  });

  it("sets correct_answer to null when not numeric", () => {
    const input = [{ text: "Q1", subject: "Física", correct_answer: "C" }];
    const result = validateExtractedQuestions(input);
    expect(result[0].correct_answer).toBeNull();
  });

  it("maps optional topic", () => {
    const input = [{ text: "Q1", subject: "Física", topic: "  Cinemática  " }];
    const result = validateExtractedQuestions(input);
    expect(result[0].topic).toBe("Cinemática");
  });

  it("filters out null/undefined items in array", () => {
    const input = [null, undefined, { text: "Q1", subject: "Física" }];
    const result = validateExtractedQuestions(input);
    expect(result).toHaveLength(1);
  });
});
