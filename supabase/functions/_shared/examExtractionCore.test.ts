import { describe, it, expect } from "vitest";

import {
  buildExtractionMessages,
  parseExtractionResponse,
  OCR_SYSTEM_PROMPT,
  EXTRACT_PROMPT,
  MAX_PDF_TEXT_CHARS,
  MAX_FILE_NAME_CHARS,
  EXTRACTION_TIMEOUT_MS,
} from "./examExtractionCore";

describe("buildExtractionMessages", () => {
  it("puts the OCR system prompt as the first message", () => {
    const messages = buildExtractionMessages("texto nativo", "prova.pdf", []);
    expect(messages[0]).toEqual({ role: "system", content: OCR_SYSTEM_PROMPT });
  });

  it("embeds the extract prompt, file name, and native text in the first user content part", () => {
    const messages = buildExtractionMessages("Questão 1) 2+2=?", "prova.pdf", []);
    const userMessage = messages[1];
    expect(userMessage.role).toBe("user");
    const firstPart = (userMessage.content as any[])[0];
    expect(firstPart.type).toBe("text");
    expect(firstPart.text).toContain(EXTRACT_PROMPT);
    expect(firstPart.text).toContain("prova.pdf");
    expect(firstPart.text).toContain("Questão 1) 2+2=?");
  });

  it("has no page-image parts when pageImages is empty", () => {
    const messages = buildExtractionMessages("texto", "a.pdf", []);
    const userMessage = messages[1];
    expect((userMessage.content as any[])).toHaveLength(1);
  });

  it("appends a page marker + image_url part per page, in order", () => {
    const messages = buildExtractionMessages("texto", "a.pdf", ["data:image/jpeg;base64,AAA", "data:image/jpeg;base64,BBB"]);
    const parts = messages[1].content as any[];
    expect(parts).toHaveLength(5); // 1 text + (marker+image) * 2
    expect(parts[1]).toEqual({ type: "text", text: "\n[Página 1]" });
    expect(parts[2]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,AAA" } });
    expect(parts[3]).toEqual({ type: "text", text: "\n[Página 2]" });
    expect(parts[4]).toEqual({ type: "image_url", image_url: { url: "data:image/jpeg;base64,BBB" } });
  });

  it("sanitizes and caps the file name and native text", () => {
    const longText = "a".repeat(MAX_PDF_TEXT_CHARS + 500);
    const messages = buildExtractionMessages(longText, "<prova>.pdf", []);
    const text = (messages[1].content as any[])[0].text as string;
    expect(text).toContain("&lt;prova&gt;.pdf");
    expect(text.length).toBeLessThan(longText.length + 1000);
  });

  it("caps the file name independently at MAX_FILE_NAME_CHARS", () => {
    const longName = "n".repeat(MAX_FILE_NAME_CHARS + 50) + ".pdf";
    const messages = buildExtractionMessages("texto", longName, []);
    const text = (messages[1].content as any[])[0].text as string;
    expect(text).not.toContain(longName);
  });
});

describe("parseExtractionResponse", () => {
  function withToolCallArgs(args: string) {
    return {
      choices: [{ message: { tool_calls: [{ function: { arguments: args } }] } }],
    };
  }

  it("returns the questions array from a valid tool call", () => {
    const aiData = withToolCallArgs(JSON.stringify({ questions: [{ text: "Q1", subject: "Matemática" }] }));
    expect(parseExtractionResponse(aiData)).toEqual([{ text: "Q1", subject: "Matemática" }]);
  });

  it("returns an empty array when there is no tool call", () => {
    expect(parseExtractionResponse({ choices: [{ message: {} }] })).toEqual([]);
  });

  it("returns an empty array when the tool call arguments are not valid JSON", () => {
    expect(parseExtractionResponse(withToolCallArgs("{not json"))).toEqual([]);
  });

  it("returns an empty array when `questions` is missing from the parsed JSON", () => {
    expect(parseExtractionResponse(withToolCallArgs(JSON.stringify({})))).toEqual([]);
  });

  it("returns an empty array when `questions` is not an array", () => {
    expect(parseExtractionResponse(withToolCallArgs(JSON.stringify({ questions: "oops" })))).toEqual([]);
  });

  it("returns an empty array for a completely malformed response shape", () => {
    expect(parseExtractionResponse(null)).toEqual([]);
    expect(parseExtractionResponse({})).toEqual([]);
  });
});

describe("named constants", () => {
  it("exposes an extraction timeout well under the edge runtime's own wall-clock limit", () => {
    expect(EXTRACTION_TIMEOUT_MS).toBe(100_000);
    expect(EXTRACTION_TIMEOUT_MS).toBeLessThan(400_000);
  });
});
