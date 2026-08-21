import * as pdfjsLib from "pdfjs-dist";
import pdfjsWorker from "pdfjs-dist/build/pdf.worker.min.mjs?url";

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

export type PdfParseResult = {
  text: string;
  pageImages: string[];
  pageCount: number;
  pagesProcessed: number[];
  truncated: boolean;
};

/**
 * Matches `MAX_PDF_TEXT_CHARS` in `_shared/examExtractionCore.ts`, which is
 * where this text is sanitised on the way into the extraction prompt. Cutting
 * at 8000 here meant discarding 84% of the budget the server would have
 * accepted — and left the DOCX path (uncapped) sending several times more
 * text than a PDF of the very same exam.
 */
const MAX_TEXT_CHARS = 50000;
const MAX_IMAGE_PAGES = 8;
const RENDER_SCALE = 3.0;

export async function parsePdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<PdfParseResult> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  const pageCount = pdf.numPages;
  let fullText = "";
  const pageImages: string[] = [];
  const pagesProcessed: number[] = [];

  for (let i = 1; i <= pageCount; i++) {
    onProgress?.(i, pageCount);
    const page = await pdf.getPage(i);

    const textContent = await page.getTextContent();
    // pdf.js hands back positioned runs, not lines. Flattening them all with a
    // single space destroyed the one structural cue the extraction model has:
    // an enunciado and its alternatives arrived as a single blob, and the
    // extraction prompt is told to treat that blob as the source of truth.
    // `hasEOL` marks the runs that ended a visual line — honour it.
    const pageText = (textContent.items as Array<{ str: string; hasEOL?: boolean }>)
      .map((item) => item.str + (item.hasEOL ? "\n" : " "))
      .join("")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
    fullText += `\n--- Página ${i} ---\n${pageText}`;

    if (pageImages.length < MAX_IMAGE_PAGES) {
      const viewport = page.getViewport({ scale: RENDER_SCALE });
      const canvas = document.createElement("canvas");
      canvas.width = viewport.width;
      canvas.height = viewport.height;
      const ctx = canvas.getContext("2d")!;
      ctx.fillStyle = "#FFFFFF";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: ctx, viewport }).promise;
      pageImages.push(canvas.toDataURL("image/jpeg", 0.85));
      pagesProcessed.push(i);
    }

    page.cleanup();
  }

  const truncated = fullText.length > MAX_TEXT_CHARS;
  if (truncated) {
    fullText = fullText.substring(0, MAX_TEXT_CHARS) + "\n\n[... texto truncado]";
  }

  return { text: fullText.trim(), pageImages, pageCount, pagesProcessed, truncated };
}

export async function renderPdfPage(file: File, pageNumber: number, scale = 1.5): Promise<string> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const page = await pdf.getPage(pageNumber);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  const ctx = canvas.getContext("2d")!;
  ctx.fillStyle = "#FFFFFF";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  await page.render({ canvasContext: ctx, viewport }).promise;
  const dataUrl = canvas.toDataURL("image/jpeg", 0.9);
  page.cleanup();
  return dataUrl;
}

export async function getPdfPageCount(file: File): Promise<number> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  return pdf.numPages;
}
