import * as pdfjsLib from "pdfjs-dist";
import { pageTextFromItems } from "./pdfTextLayout";
import { fractionBarsFromOperatorList, type FractionBar } from "./pdfFractionBars";
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

type PdfPage = Awaited<ReturnType<pdfjsLib.PDFDocumentProxy["getPage"]>>;

/**
 * Rasterises one page to a JPEG data URL. pdf.js 6 draws straight into the
 * `canvas` (the old `canvasContext` param is only a backwards-compat path) and
 * paints `background` before the page content, so JPEG never ends up with
 * black where the PDF is transparent.
 */
async function renderPageToJpeg(page: PdfPage, scale: number, quality: number): Promise<string> {
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvas, viewport, background: "#FFFFFF" }).promise;
  return canvas.toDataURL("image/jpeg", quality);
}

/**
 * Opens `file` with pdf.js, hands the document to `read`, and always tears it
 * down afterwards. Every `getDocument` spawns its own Web Worker and only
 * `loadingTask.destroy()` terminates it; skipping it leaked two workers per
 * PDF preview and one more per page change. `read` must return plain data
 * (text, data URLs, numbers), never the document or a page, because both are
 * dead once this resolves.
 */
async function withPdfDocument<T>(
  file: File,
  read: (pdf: pdfjsLib.PDFDocumentProxy) => Promise<T>,
): Promise<T> {
  const loadingTask = pdfjsLib.getDocument({ data: await file.arrayBuffer() });
  try {
    return await read(await loadingTask.promise);
  } finally {
    // The result is already in hand: a failed teardown must not turn it into
    // an error, but it must not vanish silently either.
    await loadingTask.destroy().catch((e: unknown) => {
      console.warn("[pdf-utils] failed to release the pdf.js document/worker", e);
    });
  }
}

/** Longest wait for a page's operator list (the whole of a 59-page exam read in 1,3 s, the slowest page in 0,26 s). */
export const OPERATOR_LIST_TIMEOUT_MS = 5000;

/**
 * The thin rules of the page (fraction bars). Best effort: when the operator list cannot be
 * read the page is simply read without a bar signal, which leaves ambiguous stacks as the
 * plain lines they came as (never a guessed fraction).
 */
async function pageFractionBars(page: PdfPage): Promise<FractionBar[]> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    // The bar is a refinement, never a reason to freeze the upload: an operator list that does not
    // come back in time is given up on and the page is read without the bar signal (L9BC-5).
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(() => reject(new Error("operator list timed out")), OPERATOR_LIST_TIMEOUT_MS);
    });
    return fractionBarsFromOperatorList(await Promise.race([page.getOperatorList(), timeout]), pdfjsLib.OPS);
  } catch {
    return [];
  } finally {
    clearTimeout(timer);
  }
}

export async function parsePdf(
  file: File,
  onProgress?: (page: number, total: number) => void
): Promise<PdfParseResult> {
  return withPdfDocument(file, async (pdf) => {
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
      // `hasEOL` marks the runs that ended a visual line, and the positions say which
      // two lines are one stacked fraction (N-I-001): see `pageTextFromItems`.
      const pageText = pageTextFromItems(
        (textContent.items as Array<{ str: string; transform: number[]; width: number; height: number; hasEOL?: boolean }>).map(
          (item) => ({
            str: item.str,
            x: item.transform[4],
            y: item.transform[5],
            width: item.width,
            height: item.height,
            hasEOL: item.hasEOL,
          }),
        ),
        await pageFractionBars(page),
      );
      fullText += `\n--- Página ${i} ---\n${pageText}`;

      if (pageImages.length < MAX_IMAGE_PAGES) {
        pageImages.push(await renderPageToJpeg(page, RENDER_SCALE, 0.85));
        pagesProcessed.push(i);
      }

      page.cleanup();
    }

    const truncated = fullText.length > MAX_TEXT_CHARS;
    if (truncated) {
      fullText = fullText.substring(0, MAX_TEXT_CHARS) + "\n\n[... texto truncado]";
    }

    return { text: fullText.trim(), pageImages, pageCount, pagesProcessed, truncated };
  });
}

export async function renderPdfPage(file: File, pageNumber: number, scale = 1.5): Promise<string> {
  return withPdfDocument(file, async (pdf) => {
    const page = await pdf.getPage(pageNumber);
    const dataUrl = await renderPageToJpeg(page, scale, 0.9);
    page.cleanup();
    return dataUrl;
  });
}

export async function getPdfPageCount(file: File): Promise<number> {
  return withPdfDocument(file, async (pdf) => pdf.numPages);
}
