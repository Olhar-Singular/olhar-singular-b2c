import { describe, it, expect } from "vitest";

import * as frontendCost from "../../../src/lib/domain/extractionCost";
import {
  buildExtractionMessages,
  isAcceptedPageImage,
  parseExtractionResponse,
  validateExamExtractionRequest,
  validateQuestionBankExtractionRequest,
  OCR_SYSTEM_PROMPT,
  EXTRACT_PROMPT,
  EXTRACTION_COST,
  MAX_PDF_TEXT_CHARS,
  MAX_PDF_TEXT_INPUT_CHARS,
  MAX_PAGE_IMAGES,
  MAX_PAGE_IMAGES_TOTAL_CHARS,
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

  it("never forwards an image that is not an accepted data URL, keeping the page numbering", () => {
    // Anything else (an http(s) URL above all) would make the AI provider
    // fetch a URL of the caller's choosing.
    const messages = buildExtractionMessages("texto", "a.pdf", [
      "https://evil.example/pagina.png",
      "data:image/png;base64,AAAA",
    ]);
    const parts = messages[1].content as any[];
    expect(parts).toEqual([
      expect.objectContaining({ type: "text" }),
      { type: "text", text: "\n[Página 1: imagem ignorada, formato não suportado]" },
      { type: "text", text: "\n[Página 2]" },
      { type: "image_url", image_url: { url: "data:image/png;base64,AAAA" } },
    ]);
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

describe("isAcceptedPageImage", () => {
  it("accepts base64 PNG, JPEG and WEBP data URLs", () => {
    for (const url of [
      "data:image/png;base64,iVBORw0KGgo=",
      "data:image/jpeg;base64,/9j/4AAQSkZJRg==",
      "data:image/webp;base64,UklGRg+/",
      "data:image/JPEG;base64,AAAA",
    ]) {
      expect(isAcceptedPageImage(url)).toBe(true);
    }
  });

  it("refuses remote URLs, other image types and malformed payloads", () => {
    for (const value of [
      "https://evil.example/x.png",
      "http://169.254.169.254/latest/meta-data",
      "data:image/gif;base64,R0lGOD",
      "data:image/svg+xml;base64,PHN2Zz4=",
      "data:image/png,AAAA",
      "data:image/png;base64,",
      "data:image/png;base64,AA AA",
      "data:image/png;base64,AAAA\"}",
      " data:image/png;base64,AAAA",
      "",
      42,
      null,
      { url: "data:image/png;base64,AAAA" },
    ]) {
      expect(isAcceptedPageImage(value)).toBe(false);
    }
  });
});

describe("validateExamExtractionRequest", () => {
  const REQUEST_ID = "aa000000-0000-4000-8000-000000000001";
  const PAGE = "data:image/jpeg;base64,AAAA";
  const valid = { pdfText: "1) Q1", pdfFileName: "prova.pdf", pageImages: [PAGE], request_id: REQUEST_ID };
  const refused = (error: string) => ({ ok: false, error });

  it("accepts a well-formed body and hands back its fields", () => {
    expect(validateExamExtractionRequest(valid)).toEqual({
      ok: true,
      value: { pdfText: "1) Q1", pdfFileName: "prova.pdf", pageImages: [PAGE], requestId: REQUEST_ID },
    });
  });

  it("treats absent text, file name or images as empty, as long as something is left to read", () => {
    expect(validateExamExtractionRequest({ pageImages: [PAGE], request_id: REQUEST_ID })).toEqual({
      ok: true,
      value: { pdfText: "", pdfFileName: "", pageImages: [PAGE], requestId: REQUEST_ID },
    });
    expect(validateExamExtractionRequest({ pdfText: "1) Q1", pdfFileName: null, pageImages: null, request_id: REQUEST_ID }))
      .toEqual({
        ok: true,
        value: { pdfText: "1) Q1", pdfFileName: "", pageImages: [], requestId: REQUEST_ID },
      });
  });

  it("refuses a body that is not an object", () => {
    for (const body of [null, undefined, "texto", [valid]]) {
      expect(validateExamExtractionRequest(body)).toEqual(refused("Requisição inválida."));
    }
  });

  it("refuses fields of the wrong type", () => {
    expect(validateExamExtractionRequest({ ...valid, pdfText: 42 })).toEqual(refused("Texto do arquivo inválido."));
    expect(validateExamExtractionRequest({ ...valid, pdfFileName: {} })).toEqual(refused("Nome do arquivo inválido."));
    expect(validateExamExtractionRequest({ ...valid, pageImages: PAGE })).toEqual(refused("Imagens do arquivo inválidas."));
  });

  it("bounds the text, well above the prompt cap so the client's own truncation still fits", () => {
    // The PDF parser cuts at MAX_PDF_TEXT_CHARS and appends a marker; DOCX text
    // is not cut at all. The prompt cut stays where it was (sanitize).
    expect(MAX_PDF_TEXT_INPUT_CHARS).toBeGreaterThan(MAX_PDF_TEXT_CHARS + 100);
    const atLimit = "a".repeat(MAX_PDF_TEXT_INPUT_CHARS);
    expect(validateExamExtractionRequest({ ...valid, pdfText: atLimit }).ok).toBe(true);
    expect(validateExamExtractionRequest({ ...valid, pdfText: `${atLimit}a` })).toEqual(
      refused("O texto do arquivo é longo demais. Envie um arquivo menor."),
    );
  });

  it("bounds how many images one call may carry", () => {
    const images = (n: number) => Array.from({ length: n }, () => PAGE);
    expect(validateExamExtractionRequest({ ...valid, pageImages: images(MAX_PAGE_IMAGES) }).ok).toBe(true);
    expect(validateExamExtractionRequest({ ...valid, pageImages: images(MAX_PAGE_IMAGES + 1) })).toEqual(
      refused(`O arquivo tem imagens demais (máximo de ${MAX_PAGE_IMAGES}).`),
    );
  });

  it("refuses an image that is not an accepted data URL", () => {
    expect(validateExamExtractionRequest({ ...valid, pageImages: [PAGE, "https://evil.example/x.png"] })).toEqual(
      refused("O arquivo tem uma imagem em formato não suportado. Use PNG, JPEG ou WEBP."),
    );
  });

  it("bounds the total size of the images", () => {
    const prefix = "data:image/png;base64,";
    const half = `${prefix}${"A".repeat(MAX_PAGE_IMAGES_TOTAL_CHARS / 2 - prefix.length)}`;
    expect(validateExamExtractionRequest({ ...valid, pageImages: [half, half] }).ok).toBe(true);
    expect(validateExamExtractionRequest({ ...valid, pageImages: [half, half, PAGE] })).toEqual(
      refused("As imagens do arquivo são grandes demais. Envie um arquivo menor."),
    );
  });

  it("refuses a file with nothing to read (blank text and no images)", () => {
    expect(validateExamExtractionRequest({ ...valid, pdfText: "  \n ", pageImages: [] })).toEqual(
      refused("O arquivo enviado está vazio."),
    );
  });

  it("requires a well-formed request_id (the reservation's idempotency key)", () => {
    const { request_id: _omit, ...withoutId } = valid;
    expect(validateExamExtractionRequest(withoutId)).toEqual(refused("request_id inválido."));
    expect(validateExamExtractionRequest({ ...valid, request_id: "nope" })).toEqual(refused("request_id inválido."));
  });
});

describe("validateQuestionBankExtractionRequest", () => {
  // extract-questions keeps its request_id optional: the question bank page
  // never sent one, so a missing key is generated (crash safety without replay
  // dedupe), while a malformed one is still refused. Everything else is the
  // same pre-charge validation as the Adaptar upload.
  const CLIENT_ID = "aa000000-0000-4000-8000-000000000001";
  const GENERATED_ID = "bb000000-0000-4000-8000-000000000002";
  const PAGE = "data:image/jpeg;base64,AAAA";
  const generate = () => GENERATED_ID;
  const refused = (error: string) => ({ ok: false, error });

  it("generates the request_id when the client sends none", () => {
    expect(validateQuestionBankExtractionRequest({ pdfText: "1) Q1", pdfFileName: "prova.pdf", pageImages: [PAGE] }, generate))
      .toEqual({ ok: true, value: { pdfText: "1) Q1", pdfFileName: "prova.pdf", pageImages: [PAGE], requestId: GENERATED_ID } });
    expect(validateQuestionBankExtractionRequest({ pdfText: "1) Q1", request_id: null }, generate))
      .toEqual({ ok: true, value: { pdfText: "1) Q1", pdfFileName: "", pageImages: [], requestId: GENERATED_ID } });
  });

  it("keeps a well-formed client request_id (normalized) instead of generating one", () => {
    const result = validateQuestionBankExtractionRequest({ pdfText: "1) Q1", request_id: CLIENT_ID.toUpperCase() }, generate);
    expect(result).toEqual({ ok: true, value: { pdfText: "1) Q1", pdfFileName: "", pageImages: [], requestId: CLIENT_ID } });
  });

  it("refuses a malformed request_id rather than replacing it", () => {
    expect(validateQuestionBankExtractionRequest({ pdfText: "1) Q1", request_id: "nope" }, generate))
      .toEqual(refused("request_id inválido."));
  });

  it("refuses a body that is not an object", () => {
    for (const body of [null, undefined, "x", 3, [PAGE]]) {
      expect(validateQuestionBankExtractionRequest(body, generate)).toEqual(refused("Requisição inválida."));
    }
  });

  it("applies the shared bounds before anything is charged", () => {
    expect(validateQuestionBankExtractionRequest({ pdfText: "  ", pageImages: [] }, generate))
      .toEqual(refused("O arquivo enviado está vazio."));
    expect(validateQuestionBankExtractionRequest({ pageImages: ["https://example.com/a.png"] }, generate))
      .toEqual(refused("O arquivo tem uma imagem em formato não suportado. Use PNG, JPEG ou WEBP."));
    expect(validateQuestionBankExtractionRequest({ pdfText: "x".repeat(MAX_PDF_TEXT_INPUT_CHARS + 1) }, generate))
      .toEqual(refused("O texto do arquivo é longo demais. Envie um arquivo menor."));
  });
});

describe("EXTRACTION_COST", () => {
  // Same price as the question bank's extraction (extract-questions), and the
  // wizard shows it before the teacher commits (src/lib/domain/extractionCost).
  it("costs 5 credits and matches src/lib/domain/extractionCost", () => {
    expect(EXTRACTION_COST).toBe(5);
    expect(frontendCost.EXTRACTION_COST).toBe(EXTRACTION_COST);
  });
});

describe("named constants", () => {
  it("exposes an extraction timeout well under the edge runtime's own wall-clock limit", () => {
    expect(EXTRACTION_TIMEOUT_MS).toBe(100_000);
    expect(EXTRACTION_TIMEOUT_MS).toBeLessThan(400_000);
  });
});
