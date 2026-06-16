import { describe, it, expect } from "vitest";
import { validateExtractedQuestions } from "./questionParser";

const LONG_TEXT = "Este é um enunciado de questão com texto suficiente para passar na validação.";

describe("validateExtractedQuestions — return shape", () => {
  it("returns { questions, warnings } for non-array input", () => {
    expect(validateExtractedQuestions(null)).toEqual({ questions: [], warnings: [] });
    expect(validateExtractedQuestions(undefined)).toEqual({ questions: [], warnings: [] });
    expect(validateExtractedQuestions("string")).toEqual({ questions: [], warnings: [] });
    expect(validateExtractedQuestions({})).toEqual({ questions: [], warnings: [] });
  });

  it("returns { questions: [], warnings: [] } for empty array", () => {
    expect(validateExtractedQuestions([])).toEqual({ questions: [], warnings: [] });
  });
});

describe("validateExtractedQuestions — hard rejections (silent, no warning)", () => {
  it("silently drops items missing required text", () => {
    const { questions, warnings } = validateExtractedQuestions([{ text: "", subject: "Física" }]);
    expect(questions).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("silently drops items missing required subject", () => {
    const { questions, warnings } = validateExtractedQuestions([{ text: LONG_TEXT, subject: "" }]);
    expect(questions).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("silently drops items with missing fields entirely", () => {
    const { questions, warnings } = validateExtractedQuestions([{ text: LONG_TEXT }]);
    expect(questions).toEqual([]);
    expect(warnings).toEqual([]);
  });

  it("silently drops null/undefined items in array", () => {
    const { questions } = validateExtractedQuestions([null, undefined, { text: LONG_TEXT, subject: "Física" }]);
    expect(questions).toHaveLength(1);
  });
});

describe("validateExtractedQuestions — text length validation", () => {
  it("rejects questions with text shorter than 20 characters and adds warning", () => {
    const { questions, warnings } = validateExtractedQuestions([{ text: "Q1", subject: "Física" }]);
    expect(questions).toHaveLength(0);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/menos de 20 caracteres/i);
    expect(warnings[0]).toMatch(/Questão 1/i);
  });

  it("rejects exactly 19-char text with warning", () => {
    const { questions, warnings } = validateExtractedQuestions([{ text: "A".repeat(19), subject: "Física" }]);
    expect(questions).toHaveLength(0);
    expect(warnings[0]).toMatch(/Questão 1.*menos de 20/i);
  });

  it("accepts text with exactly 20 characters", () => {
    const { questions } = validateExtractedQuestions([{ text: "A".repeat(20), subject: "Física" }]);
    expect(questions).toHaveLength(1);
  });

  it("reports correct 1-based index in warning (third question rejected)", () => {
    const input = [
      { text: LONG_TEXT, subject: "Física" },
      { text: LONG_TEXT, subject: "Matemática" },
      { text: "Curto", subject: "Química" },
    ];
    const { warnings } = validateExtractedQuestions(input);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Questão 3/i);
  });
});

describe("validateExtractedQuestions — options validation", () => {
  it("converts empty options array to undefined without warning", () => {
    const { questions, warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: [] },
    ]);
    expect(questions[0].options).toBeUndefined();
    expect(warnings).toHaveLength(0);
  });

  it("rejects questions with only 1 option and adds warning", () => {
    const { questions, warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["A"] },
    ]);
    expect(questions).toHaveLength(0);
    expect(warnings[0]).toMatch(/Questão 1.*opções inválidas/i);
  });

  it("rejects questions with 6 options and adds warning", () => {
    const { questions, warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["A", "B", "C", "D", "E", "F"] },
    ]);
    expect(questions).toHaveLength(0);
    expect(warnings[0]).toMatch(/opções inválidas/i);
  });

  it("accepts 2 options", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["V", "F"] },
    ]);
    expect(questions[0].options).toHaveLength(2);
  });

  it("accepts 5 options", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["A", "B", "C", "D", "E"] },
    ]);
    expect(questions[0].options).toHaveLength(5);
  });

  it("sets options to undefined when not an array", () => {
    const { questions } = validateExtractedQuestions([{ text: LONG_TEXT, subject: "Física", options: "not array" }]);
    expect(questions[0].options).toBeUndefined();
  });
});

describe("validateExtractedQuestions — correct_answer range check", () => {
  it("forces correct_answer to -1 when index is out of options range", () => {
    const { questions, warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["A", "B", "C"], correct_answer: 4 },
    ]);
    expect(questions[0].correct_answer).toBe(-1);
    expect(warnings).toHaveLength(0);
  });

  it("keeps correct_answer when in valid range", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["A", "B", "C"], correct_answer: 2 },
    ]);
    expect(questions[0].correct_answer).toBe(2);
  });

  it("keeps correct_answer: -1 as valid unknown marker", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["A", "B", "C"], correct_answer: -1 },
    ]);
    expect(questions[0].correct_answer).toBe(-1);
  });

  it("keeps correct_answer when no options are defined (range check not applicable)", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", correct_answer: 2 },
    ]);
    expect(questions[0].correct_answer).toBe(2);
  });

  it("sets correct_answer to null when not numeric", () => {
    const { questions } = validateExtractedQuestions([{ text: LONG_TEXT, subject: "Física", correct_answer: "C" }]);
    expect(questions[0].correct_answer).toBeNull();
  });
});

describe("validateExtractedQuestions — has_figure soft warning", () => {
  it("adds warning when has_figure is true and figure_description is absent", () => {
    const { questions, warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", has_figure: true },
    ]);
    expect(questions).toHaveLength(1);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/figura.*sem descrição/i);
    expect(warnings[0]).toMatch(/Questão 1/i);
  });

  it("adds warning when has_figure is true and figure_description is empty string", () => {
    const { questions, warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", has_figure: true, figure_description: "   " },
    ]);
    expect(questions).toHaveLength(1);
    expect(warnings).toHaveLength(1);
  });

  it("does not add warning when has_figure is true and figure_description is present", () => {
    const { questions, warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", has_figure: true, figure_description: "Gráfico de velocidade" },
    ]);
    expect(questions).toHaveLength(1);
    expect(warnings).toHaveLength(0);
  });

  it("does not add warning when has_figure is false", () => {
    const { warnings } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", has_figure: false },
    ]);
    expect(warnings).toHaveLength(0);
  });
});

describe("validateExtractedQuestions — field mapping", () => {
  it("trims text and subject", () => {
    const text = "   " + LONG_TEXT + "   ";
    const { questions } = validateExtractedQuestions([{ text, subject: "  Física  " }]);
    expect(questions[0].text).toBe(LONG_TEXT);
    expect(questions[0].subject).toBe("Física");
  });

  it("maps valid question with all required fields", () => {
    const { questions } = validateExtractedQuestions([{ text: LONG_TEXT, subject: "Matemática" }]);
    expect(questions).toHaveLength(1);
    expect(questions[0].text).toBe(LONG_TEXT);
    expect(questions[0].subject).toBe("Matemática");
  });

  it("maps optional options array", () => {
    const { questions } = validateExtractedQuestions([{ text: LONG_TEXT, subject: "Física", options: ["A", "B", "C"] }]);
    expect(questions[0].options).toEqual(["A", "B", "C"]);
  });

  it("maps correct_answer when numeric and in range", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", options: ["A", "B", "C"], correct_answer: 2 },
    ]);
    expect(questions[0].correct_answer).toBe(2);
  });

  it("maps optional topic with trim", () => {
    const { questions } = validateExtractedQuestions([{ text: LONG_TEXT, subject: "Física", topic: "  Cinemática  " }]);
    expect(questions[0].topic).toBe("Cinemática");
  });

  it("maps optional resolution with trim", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", resolution: "  A resposta é B porque...  " },
    ]);
    expect(questions[0].resolution).toBe("A resposta é B porque...");
  });

  it("resolution is undefined when absent", () => {
    const { questions } = validateExtractedQuestions([{ text: LONG_TEXT, subject: "Física" }]);
    expect(questions[0].resolution).toBeUndefined();
  });

  it("resolution is undefined when empty or whitespace", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", resolution: "   " },
    ]);
    expect(questions[0].resolution).toBeUndefined();
  });

  it("mixes valid and invalid questions, returning both correct lists", () => {
    const input = [
      { text: LONG_TEXT, subject: "Física" },           // valid
      { text: "Q2", subject: "Química" },               // rejected: too short
      { text: LONG_TEXT, subject: "Matemática" },       // valid
    ];
    const { questions, warnings } = validateExtractedQuestions(input);
    expect(questions).toHaveLength(2);
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/Questão 2/i);
  });

  it("passes through has_figure=true and image_page when present", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", has_figure: true, image_page: 2 },
    ]);
    expect(questions[0].has_figure).toBe(true);
    expect(questions[0].image_page).toBe(2);
  });

  it("passes through figure_bbox when present", () => {
    const bbox = { x: 0.1, y: 0.2, width: 0.4, height: 0.3 };
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", has_figure: true, image_page: 1, figure_bbox: bbox },
    ]);
    expect(questions[0].figure_bbox).toEqual(bbox);
  });

  it("passes through figure_description when present", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física", has_figure: true, figure_description: "Gráfico XY" },
    ]);
    expect(questions[0].figure_description).toBe("Gráfico XY");
  });

  it("has_figure defaults to false when not provided", () => {
    const { questions } = validateExtractedQuestions([
      { text: LONG_TEXT, subject: "Física" },
    ]);
    expect(questions[0].has_figure).toBe(false);
  });
});
