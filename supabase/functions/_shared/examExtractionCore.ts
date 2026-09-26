// =============================================================================
// Pure vision-extraction core shared by extract-questions (question bank) and
// extract-exam-for-adaptation (Adaptar's direct upload). Both are charged the
// same EXTRACTION_COST through a credit reservation.
//
// All non-trivial logic lives here so it can be unit-tested under Vitest/Node
// (each function's index.ts stays a thin HTTP glue layer, per CLAUDE.md).
//
// NO URL imports in this file.
// =============================================================================

import { sanitize } from "./sanitize.ts";
import { requireRequestId, resolveRequestId } from "./creditReservation.ts";

/** Credits per extraction. Mirrors src/lib/domain/extractionCost.ts (sync test). */
export const EXTRACTION_COST = 5;

/** Where the native text is cut on its way into the prompt (sanitize). */
export const MAX_PDF_TEXT_CHARS = 50000;
export const MAX_FILE_NAME_CHARS = 200;

/**
 * Largest text a request may carry at all. Above the prompt cut on purpose:
 * the PDF parser appends a marker after its own 50000-char cut and DOCX text
 * is not cut client-side, and both keep being trimmed by sanitize as before.
 * This only refuses absurd payloads before anything is charged.
 */
export const MAX_PDF_TEXT_INPUT_CHARS = 2 * MAX_PDF_TEXT_CHARS;
/** Page renders (PDF, at most 8 today) or embedded figures (DOCX) per call. */
export const MAX_PAGE_IMAGES = 20;
/**
 * Sum of the image data URLs, in characters. Gemini refuses inline requests
 * over ~20 MB, so anything bigger would be charged only to fail upstream.
 */
export const MAX_PAGE_IMAGES_TOTAL_CHARS = 20_000_000;

const PAGE_IMAGE_DATA_URL = /^data:image\/(?:png|jpeg|webp);base64,[a-z0-9+/]+={0,2}$/i;

/**
 * Only inline base64 PNG/JPEG/WEBP reach the AI as `image_url`. Anything else
 * (an http(s) URL above all) would have the provider fetch a URL of the
 * caller's choosing, on our bill.
 */
export function isAcceptedPageImage(value: unknown): value is string {
  return typeof value === "string" && PAGE_IMAGE_DATA_URL.test(value);
}

/**
 * Budget for the vision-extraction call (single attempt, no reask loop).
 * Without a client-side abort, a hung request runs until the edge runtime's
 * OWN wall-clock limit kills the isolate — the client then sees a severed
 * connection ("sem conexão com o servidor") instead of a clean, actionable
 * error. Generous because multi-page multimodal input is slower than a
 * text-only call, but well under the runtime's own limit.
 */
export const EXTRACTION_TIMEOUT_MS = 100_000;

export const OCR_SYSTEM_PROMPT = `You are an expert OCR system for Brazilian educational exams (ENEM, vestibulares, simulados).
Images may have 2-3 columns, figures, tables, and multiple questions per page.

EXTRACTION RULES:
- If a "TEXTO NATIVO EXTRAÍDO" block is provided, it is the authoritative, ground-truth source for every question's text and alternatives — copy it verbatim instead of re-reading the pixels. Use the page images only to detect figures/diagrams, their position, and the reading order — never to override text that the native block already provides.
- Read left column top-to-bottom, then right column top-to-bottom
- Extract EVERY question visible — do NOT stop after the first one, do NOT skip any
- Extract ALL question formats, not only multiple choice: open-ended/essay (dissertativa), true-false (verdadeiro/falso), fill-in-the-blank (completar lacunas), matching (associação/colunas), and multiple choice. A question without alternatives is still a question — extract it with an empty "options" array.
- Accepted numbering patterns: "1." / "1)" / "Q1" / "Questão 1" / "QUESTÃO 1" / Roman numerals ("I.", "II.", "III.")
- NEVER invent, deduce, or complete truncated statements — return the text exactly as it appears in the document
- Ignore headers, footers, school name, teacher name, watermarks
- Preserve all units and math symbols exactly (m/s², 10⁸, ≥, ≤, etc.)

FIELD RULES:
- "options": only for multiple-choice questions; extract alternatives as an array of strings. Use an empty array for open-ended/dissertativa, fill-in-the-blank, or matching questions. Detect alternatives by markers (a. / a) / A. / A) / (a) / (A)) but DO NOT include the marker in the string — return just the alternative text (e.g. "sucos", not "a) sucos").
- "correct_answer": set ONLY if an explicit answer key appears in the document (e.g. "Gabarito: B", "Resposta: C"). Index: 0=A, 1=B, 2=C, 3=D, 4=E. Use -1 in ALL other cases — never solve or guess.
- "resolution": short explanation (1-3 sentences)
- "has_figure": true if the question text references a figure, diagram, graph, table, or image — even if it is not visible in the scan
- "figure_description": describe what the figure shows, or what the question says about it if not visible
- "image_page": which page image (1-indexed) contains the figure. 0 if no figure.
- "figure_bbox": normalized bounding box (0.0 to 1.0) relative to page: { "x": left, "y": top, "width": width, "height": height }`;

export const EXTRACT_PROMPT = `Extraia todas as questões deste documento/imagem. Para cada questão extraia todos os campos solicitados pela função save_questions. Seja meticuloso: extraia TODAS as questões visíveis.`;

export const EXTRACTION_TOOL_SCHEMA = {
  type: "function" as const,
  function: {
    name: "save_questions",
    description: "Return all extracted questions as structured data",
    parameters: {
      type: "object",
      properties: {
        questions: {
          type: "array",
          items: {
            type: "object",
            properties: {
              text: { type: "string", description: "Full question text / enunciado completo" },
              subject: { type: "string", description: "Subject area (Física, Matemática, etc)" },
              topic: { type: "string", description: "Specific topic" },
              options: { type: "array", items: { type: "string" }, description: "Answer alternatives" },
              correct_answer: { type: "integer", description: "0-based index of correct answer. -1 if unknown" },
              resolution: { type: "string", description: "Short explanation (1-3 sentences)" },
              has_figure: { type: "boolean", description: "Whether question has an associated figure" },
              figure_description: { type: "string", description: "Description of the figure" },
              image_page: { type: "integer", description: "1-indexed page containing the figure. 0 if none" },
              figure_bbox: {
                type: "object",
                properties: {
                  x: { type: "number" },
                  y: { type: "number" },
                  width: { type: "number" },
                  height: { type: "number" },
                },
                description: "Normalized bounding box (0.0-1.0) of the figure on the page",
              },
            },
            required: ["text", "subject"],
          },
        },
      },
      required: ["questions"],
    },
  },
};

/** A chat message in the OpenAI-compatible format used by the AI gateway. */
export type ExtractionChatMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: Array<Record<string, unknown>> };

/**
 * Build the OpenAI-compatible messages array for the vision-extraction call:
 * one system message (the OCR rules) and one user message mixing the native
 * text (ground truth, when present) with one image part per page.
 */
export function buildExtractionMessages(
  pdfText: string,
  pdfFileName: string,
  pageImages: string[],
): ExtractionChatMessage[] {
  const contentParts: Array<Record<string, unknown>> = [
    {
      type: "text",
      text: `${EXTRACT_PROMPT}\n\nTEXTO NATIVO EXTRAÍDO do documento "${sanitize(pdfFileName, MAX_FILE_NAME_CHARS)}" (fonte de verdade quando presente):\n${sanitize(pdfText, MAX_PDF_TEXT_CHARS)}`,
    },
  ];
  for (let i = 0; i < pageImages.length; i++) {
    // Defense in depth for callers that do not validate first: the page keeps
    // its number (the model's image_page indexes this list) but not its image.
    if (!isAcceptedPageImage(pageImages[i])) {
      contentParts.push({ type: "text", text: `\n[Página ${i + 1}: imagem ignorada, formato não suportado]` });
      continue;
    }
    contentParts.push({ type: "text", text: `\n[Página ${i + 1}]` });
    contentParts.push({ type: "image_url", image_url: { url: pageImages[i] } });
  }

  return [
    { role: "system", content: OCR_SYSTEM_PROMPT },
    { role: "user", content: contentParts },
  ];
}

/** One extracted question, in the shape returned by the `save_questions` tool call. */
export interface ExtractedQuestion {
  text: string;
  subject: string;
  topic?: string;
  options?: string[];
  correct_answer?: number;
  resolution?: string;
  has_figure?: boolean;
  figure_description?: string;
  image_page?: number;
  figure_bbox?: { x: number; y: number; width: number; height: number };
}

/**
 * Parse the AI gateway's raw JSON response into the extracted question list.
 * Never throws: a missing/malformed tool call yields an empty array, mirroring
 * the extraction endpoint's existing "best effort" behavior.
 */
export function parseExtractionResponse(aiData: unknown): ExtractedQuestion[] {
  const toolCall = (aiData as any)?.choices?.[0]?.message?.tool_calls?.[0];
  const rawArgs = toolCall?.function?.arguments;
  if (!rawArgs) return [];
  try {
    const parsed = JSON.parse(rawArgs);
    return Array.isArray(parsed.questions) ? parsed.questions : [];
  } catch {
    return [];
  }
}

/** The JSON body of extract-exam-for-adaptation, validated. */
export interface ExamExtractionRequest {
  pdfText: string;
  pdfFileName: string;
  pageImages: string[];
  /** Id of the credit reservation: the replay guard. */
  requestId: string;
}

export type ExamExtractionRequestResult =
  | { ok: true; value: ExamExtractionRequest }
  | { ok: false; error: string };

/**
 * Validate an extraction request BEFORE anything is charged: types, size
 * bounds, the image allowlist, something to read, and the request_id.
 * Absent text/name/images default to empty, as the endpoint always did.
 */
export function validateExamExtractionRequest(body: unknown): ExamExtractionRequestResult {
  const fail = (error: string): ExamExtractionRequestResult => ({ ok: false, error });

  if (!body || typeof body !== "object" || Array.isArray(body)) return fail("Requisição inválida.");
  const raw = body as Record<string, unknown>;

  const pdfText = raw.pdfText ?? "";
  if (typeof pdfText !== "string") return fail("Texto do arquivo inválido.");
  if (pdfText.length > MAX_PDF_TEXT_INPUT_CHARS) {
    return fail("O texto do arquivo é longo demais. Envie um arquivo menor.");
  }

  const pdfFileName = raw.pdfFileName ?? "";
  if (typeof pdfFileName !== "string") return fail("Nome do arquivo inválido.");

  const pageImages = raw.pageImages ?? [];
  if (!Array.isArray(pageImages)) return fail("Imagens do arquivo inválidas.");
  if (pageImages.length > MAX_PAGE_IMAGES) {
    return fail(`O arquivo tem imagens demais (máximo de ${MAX_PAGE_IMAGES}).`);
  }
  let totalChars = 0;
  for (const image of pageImages) {
    if (!isAcceptedPageImage(image)) {
      return fail("O arquivo tem uma imagem em formato não suportado. Use PNG, JPEG ou WEBP.");
    }
    totalChars += image.length;
  }
  if (totalChars > MAX_PAGE_IMAGES_TOTAL_CHARS) {
    return fail("As imagens do arquivo são grandes demais. Envie um arquivo menor.");
  }

  if (!pdfText.trim() && pageImages.length === 0) return fail("O arquivo enviado está vazio.");

  const requestId = requireRequestId(raw.request_id);
  if (!requestId.ok) return fail("request_id inválido.");

  return { ok: true, value: { pdfText, pdfFileName, pageImages, requestId: requestId.id } };
}

/**
 * extract-questions (question bank) flavour of the same validation. Its
 * request_id stays optional, as it always was there (the page never sent one):
 * a missing key is generated (crash safety, no cross-retry dedupe) and a
 * malformed one is refused. Everything else is checked exactly as above.
 */
export function validateQuestionBankExtractionRequest(
  body: unknown,
  generateRequestId: () => string,
): ExamExtractionRequestResult {
  if (!body || typeof body !== "object" || Array.isArray(body)) {
    return { ok: false, error: "Requisição inválida." };
  }
  const raw = body as Record<string, unknown>;
  const requestId = resolveRequestId(raw.request_id, generateRequestId);
  if (!requestId.ok) return { ok: false, error: "request_id inválido." };
  return validateExamExtractionRequest({ ...raw, request_id: requestId.id });
}
