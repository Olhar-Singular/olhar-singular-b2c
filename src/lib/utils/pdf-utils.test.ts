import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "mock-worker-url" }));

const getDocument = vi.fn();
/** `PDFDocumentLoadingTask.destroy` — tears down the document AND the worker it spawned. */
const destroyTask = vi.fn();

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  // The operator numbers `fractionBarsFromOperatorList` reads.
  OPS: { save: 10, restore: 11, transform: 12, setLineWidth: 2, stroke: 20, closeStroke: 21, fill: 22, eoFill: 23, fillStroke: 24, eoFillStroke: 25, closeFillStroke: 26, closeEOFillStroke: 27, endPath: 28, constructPath: 91 },
  // Every loading task carries `destroy`; a test's own task shape wins.
  getDocument: (...args: unknown[]) => ({ destroy: destroyTask, ...getDocument(...args) }),
}));

import { parsePdf, renderPdfPage, getPdfPageCount, OPERATOR_LIST_TIMEOUT_MS } from "./pdf-utils";

/** pdf.js runs always carry a position; these sit on one row, so no fraction is ever stacked. */
const onOneRow = <T extends { str: string }>(items: T[]) =>
  items.map((item, k) => ({ width: 5, height: 12, transform: [1, 0, 0, 1, 10 + 6 * k, 700], ...item }));

function makePage(text: string) {
  return {
    getTextContent: vi.fn().mockResolvedValue({ items: onOneRow(text.split(" ").map((str) => ({ str }))) }),
    getViewport: vi.fn().mockReturnValue({ width: 100, height: 200 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
}

/** A page whose text runs carry pdf.js's real `hasEOL` line-break flag. */
function makePageWithItems(items: Array<{ str: string; hasEOL?: boolean }>) {
  return {
    getTextContent: vi.fn().mockResolvedValue({ items: onOneRow(items) }),
    getViewport: vi.fn().mockReturnValue({ width: 100, height: 200 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
}

function singlePage(page: ReturnType<typeof makePageWithItems>) {
  getDocument.mockReturnValue({
    promise: Promise.resolve({ numPages: 1, getPage: () => Promise.resolve(page) }),
  });
}

function fakeFile() {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "f.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  getDocument.mockReset();
  destroyTask.mockReset();
  destroyTask.mockResolvedValue(undefined);
});

describe("pdf-utils — parsePdf", () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
          toDataURL: () => "data:image/jpeg;base64,FAKE",
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it("aggregates text per page and renders images for the first MAX_IMAGE_PAGES pages", async () => {
    const pages = [makePage("hello world"), makePage("second page")];
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 2,
        getPage: (i: number) => Promise.resolve(pages[i - 1]),
      }),
    });

    const onProgress = vi.fn();
    const result = await parsePdf(fakeFile(), onProgress);

    expect(result.pageCount).toBe(2);
    expect(result.pageImages).toHaveLength(2);
    expect(result.pagesProcessed).toEqual([1, 2]);
    expect(result.text).toContain("Página 1");
    expect(result.text).toContain("hello world");
    expect(result.text).toContain("second page");
    expect(onProgress).toHaveBeenCalledWith(1, 2);
    expect(onProgress).toHaveBeenCalledWith(2, 2);
  });

  // Line structure is what separates an enunciado from its alternatives.
  // Flattening every run with a single space turned "Qual é o valor? (a) 2
  // (b) 4" into one undifferentiated blob, and the extraction prompt is told
  // to treat that blob as the source of truth.
  // L9A-1: a lone centred pair is a fraction only when the page draws a bar between the lines.
  describe("lone stacked pair", () => {
    const stacked = () => [
      { str: "Margem", transform: [1, 0, 0, 1, 90, 700], width: 40, height: 12 },
      { str: "a", transform: [1, 0, 0, 1, 240, 650], width: 5, height: 12, hasEOL: true },
      { str: "b", transform: [1, 0, 0, 1, 240, 635], width: 5, height: 12 },
    ];
    const pageWith = (getOperatorList: unknown) => ({
      getTextContent: vi.fn().mockResolvedValue({ items: stacked() }),
      ...(getOperatorList ? { getOperatorList } : {}),
      getViewport: vi.fn().mockReturnValue({ width: 100, height: 200 }),
      render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
      cleanup: vi.fn(),
    });
    const barList = () =>
      Promise.resolve({
        fnArray: [91],
        argsArray: [[22, [Float32Array.from([0, 236, 642.2, 1, 249, 642.2, 1, 249, 642.8, 1, 236, 642.8, 4])], [0, 0, 0, 0]]],
      });

    it("groups it when the operator list has a bar between the two lines", async () => {
      singlePage(pageWith(vi.fn().mockImplementation(barList)) as never);
      expect((await parsePdf(fakeFile())).text).toContain("Margem\na/b");
    });

    it("keeps two lines when there is no bar", async () => {
      singlePage(pageWith(vi.fn().mockResolvedValue({ fnArray: [], argsArray: [] })) as never);
      expect((await parsePdf(fakeFile())).text).toContain("Margem a\nb");
    });

    // L9BC-5: a getOperatorList that never comes back must not freeze the upload.
    it("gives up on an operator list that never returns and reads the page without bars", async () => {
      vi.useFakeTimers();
      try {
        singlePage(pageWith(vi.fn().mockReturnValue(new Promise(() => {}))) as never);
        const parsing = parsePdf(fakeFile());
        await vi.advanceTimersByTimeAsync(OPERATOR_LIST_TIMEOUT_MS + 1);
        expect((await parsing).text).toContain("Margem a\nb");
      } finally {
        vi.useRealTimers();
      }
    });

    it("does not wait for the timeout when the operator list comes back", async () => {
      vi.useFakeTimers();
      try {
        singlePage(pageWith(vi.fn().mockImplementation(barList)) as never);
        const parsing = parsePdf(fakeFile());
        await vi.advanceTimersByTimeAsync(0);
        expect((await parsing).text).toContain("Margem\na/b");
        expect(vi.getTimerCount()).toBe(0);
      } finally {
        vi.useRealTimers();
      }
    });

    it("keeps two lines when the operator list cannot be read", async () => {
      singlePage(pageWith(vi.fn().mockRejectedValue(new Error("boom"))) as never);
      expect((await parsePdf(fakeFile())).text).toContain("Margem a\nb");
      singlePage(pageWith(undefined) as never);
      expect((await parsePdf(fakeFile())).text).toContain("Margem a\nb");
    });
  });

  it("keeps the line breaks the PDF actually has", async () => {
    singlePage(
      makePageWithItems([
        { str: "Qual é o valor de x?", hasEOL: true },
        { str: "(a) 2", hasEOL: true },
        { str: "(b) 4" },
      ]),
    );
    const result = await parsePdf(fakeFile());
    expect(result.text).toContain("Qual é o valor de x?\n(a) 2\n(b) 4");
  });

  it("writes a stacked fraction as (numerator)/denominator from the run positions (N-I-001)", async () => {
    const at = (x: number, y: number, width = 6) => ({ transform: [1, 0, 0, 1, x, y], width, height: 12 });
    // the bar the PDF draws between the two lines (3,5 pt under the numerator's baseline)
    const bar = Float32Array.from([0, 166, 659.6, 1, 195, 659.6, 1, 195, 660.2, 1, 166, 660.2, 4]);
    singlePage({
      ...makePageWithItems([
        { str: "f(x) =", ...at(90, 656.5, 40) },
        { str: "2x + 1", ...at(166, 663.4, 28), hasEOL: true },
        { str: "3", ...at(177, 648.3) },
        { str: ", calcule f(4).", ...at(196, 655.6, 64) },
      ]),
      getOperatorList: vi.fn().mockResolvedValue({ fnArray: [91], argsArray: [[22, [bar], [0, 0, 0, 0]]] }),
    } as never);
    const result = await parsePdf(fakeFile());
    expect(result.text).toContain("f(x) = (2x + 1)/3 , calcule f(4).");
  });

  it("still joins runs inside the same line with a space", async () => {
    singlePage(makePageWithItems([{ str: "Qual é" }, { str: "o valor?", hasEOL: true }]));
    const result = await parsePdf(fakeFile());
    expect(result.text).toContain("Qual é o valor?");
  });

  it("does not leave a dangling space before a line break", async () => {
    singlePage(makePageWithItems([{ str: "linha", hasEOL: true }, { str: "outra" }]));
    const result = await parsePdf(fakeFile());
    expect(result.text).not.toMatch(/ \n/);
  });

  it("collapses runs of blank lines instead of echoing PDF padding", async () => {
    singlePage(
      makePageWithItems([
        { str: "topo", hasEOL: true },
        { str: "", hasEOL: true },
        { str: "", hasEOL: true },
        { str: "", hasEOL: true },
        { str: "fim" },
      ]),
    );
    const result = await parsePdf(fakeFile());
    expect(result.text).toContain("topo\n\nfim");
  });

  it("truncates text when full text exceeds MAX_TEXT_CHARS", async () => {
    const longChunk = "x".repeat(51000);
    const pages = [makePage(longChunk)];
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.resolve(pages[0]),
      }),
    });

    const result = await parsePdf(fakeFile());
    expect(result.text).toMatch(/\[\.\.\. texto truncado\]$/);
    expect(result.text.length).toBeLessThanOrEqual(50000 + "[... texto truncado]".length + 5);
    expect(result.truncated).toBe(true);
  });

  // The server sanitises this same text at MAX_PDF_TEXT_CHARS = 50000, so a
  // client cap of 8000 was throwing away 84% of the budget before the request
  // was even built — and the DOCX path, which has no such cap, was sending
  // several times more text than a PDF of the same exam.
  it("keeps a 9k-char exam whole instead of cutting it at 8k", async () => {
    singlePage(makePageWithItems([{ str: "y".repeat(9000) }]));
    const result = await parsePdf(fakeFile());
    expect(result.truncated).toBe(false);
    expect(result.text).toContain("y".repeat(9000));
  });

  it("sets truncated=false when text is within MAX_TEXT_CHARS", async () => {
    const pages = [makePage("short text")];
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.resolve(pages[0]),
      }),
    });
    const result = await parsePdf(fakeFile());
    expect(result.truncated).toBe(false);
  });

  it("renders page images at RENDER_SCALE 3.0", async () => {
    const pages = [makePage("hello world")];
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: (i: number) => Promise.resolve(pages[i - 1]),
      }),
    });

    await parsePdf(fakeFile());
    expect(pages[0].getViewport).toHaveBeenCalledWith({ scale: 3.0 });
  });

  // pdf.js 6 renders into the `canvas` itself; `canvasContext` survives only as
  // a backwards-compat path. The white background is what keeps the JPEG
  // sent to the extraction model from going black on transparent pages.
  it("hands pdf.js the canvas (not a 2D context) with a white background", async () => {
    const page = makePage("hello world");
    singlePage(page);

    await parsePdf(fakeFile());

    const params = page.render.mock.calls[0][0];
    expect(params).not.toHaveProperty("canvasContext");
    expect(params.canvas).toMatchObject({ width: 100, height: 200 });
    expect(params.viewport).toEqual({ width: 100, height: 200 });
    expect(params.background).toBe("#FFFFFF");
  });

  it("only renders the first 8 pages even when document has more", async () => {
    const pages = Array.from({ length: 12 }, () => makePage("p"));
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 12,
        getPage: (i: number) => Promise.resolve(pages[i - 1]),
      }),
    });

    const result = await parsePdf(fakeFile());
    expect(result.pageImages).toHaveLength(8);
    expect(result.pagesProcessed).toEqual([1, 2, 3, 4, 5, 6, 7, 8]);
  });
});

describe("pdf-utils — renderPdfPage", () => {
  let originalCreateElement: typeof document.createElement;
  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({ fillStyle: "", fillRect: vi.fn(), drawImage: vi.fn() }),
          toDataURL: () => "data:image/jpeg;base64,PAGE",
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    }) as typeof document.createElement;
  });
  afterEach(() => {
    document.createElement = originalCreateElement;
  });

  it("renders a single page and returns a JPEG data URL", async () => {
    const page = makePage("text");
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 3,
        getPage: () => Promise.resolve(page),
      }),
    });

    const dataUrl = await renderPdfPage(fakeFile(), 2, 1.5);
    expect(dataUrl).toContain("data:image/jpeg");
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.5 });
    expect(page.cleanup).toHaveBeenCalled();
  });

  it("hands pdf.js the canvas (not a 2D context) with a white background", async () => {
    const page = makePage("t");
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 1, getPage: () => Promise.resolve(page) }),
    });

    await renderPdfPage(fakeFile(), 1);

    const params = page.render.mock.calls[0][0];
    expect(params).not.toHaveProperty("canvasContext");
    expect(params.canvas).toMatchObject({ width: 100, height: 200 });
    expect(params.background).toBe("#FFFFFF");
  });

  it("uses default scale 1.5 when omitted", async () => {
    const page = makePage("t");
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.resolve(page),
      }),
    });
    await renderPdfPage(fakeFile(), 1);
    expect(page.getViewport).toHaveBeenCalledWith({ scale: 1.5 });
  });
});

describe("pdf-utils — getPdfPageCount", () => {
  it("returns the document's numPages", async () => {
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 7 }),
    });
    await expect(getPdfPageCount(fakeFile())).resolves.toBe(7);
  });
});

// Each `getDocument` spawns its own pdf.js Web Worker, and only
// `loadingTask.destroy()` terminates it. Skipping it leaked two workers every
// time the PDF preview modal opened and one more per page change.
describe("pdf-utils — releases the pdf.js document and its worker", () => {
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      if (tag === "canvas") {
        return { width: 0, height: 0, toDataURL: () => "data:image/jpeg;base64,X" } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    document.createElement = originalCreateElement;
    vi.restoreAllMocks();
  });

  it("parsePdf destroys the loading task once every page is done", async () => {
    const pages = [makePage("a"), makePage("b")];
    getDocument.mockReturnValue({
      promise: Promise.resolve({ numPages: 2, getPage: (i: number) => Promise.resolve(pages[i - 1]) }),
    });

    const result = await parsePdf(fakeFile());

    expect(destroyTask).toHaveBeenCalledTimes(1);
    const destroyedAt = destroyTask.mock.invocationCallOrder[0];
    expect(destroyedAt).toBeGreaterThan(pages[1].render.mock.invocationCallOrder[0]);
    expect(destroyedAt).toBeGreaterThan(pages[1].cleanup.mock.invocationCallOrder[0]);
    // What the caller keeps is plain data, nothing tied to the dead document.
    expect(result.pageImages).toEqual(["data:image/jpeg;base64,X", "data:image/jpeg;base64,X"]);
  });

  it("renderPdfPage destroys the loading task after rasterising the page", async () => {
    const page = makePage("t");
    singlePage(page);

    await expect(renderPdfPage(fakeFile(), 1)).resolves.toBe("data:image/jpeg;base64,X");

    expect(destroyTask).toHaveBeenCalledTimes(1);
    expect(destroyTask.mock.invocationCallOrder[0]).toBeGreaterThan(page.cleanup.mock.invocationCallOrder[0]);
  });

  it("getPdfPageCount destroys the loading task after reading numPages", async () => {
    getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 4 }) });

    await expect(getPdfPageCount(fakeFile())).resolves.toBe(4);

    expect(destroyTask).toHaveBeenCalledTimes(1);
  });

  it("still destroys the loading task when rendering fails", async () => {
    const page = makePage("t");
    page.render.mockReturnValue({ promise: Promise.reject(new Error("render boom")) });
    singlePage(page);

    await expect(renderPdfPage(fakeFile(), 1)).rejects.toThrow("render boom");

    expect(destroyTask).toHaveBeenCalledTimes(1);
  });

  it("still destroys the loading task when the PDF cannot be opened", async () => {
    getDocument.mockReturnValue({ promise: Promise.reject(new Error("Invalid PDF structure")) });

    await expect(getPdfPageCount(fakeFile())).rejects.toThrow("Invalid PDF structure");

    expect(destroyTask).toHaveBeenCalledTimes(1);
  });

  // The page is already rendered by then: failing to tear the worker down must
  // not turn a good result into an error, but it must not vanish silently either.
  it("returns the result and warns when tearing the document down fails", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
    destroyTask.mockRejectedValueOnce(new Error("transport gone"));
    getDocument.mockReturnValue({ promise: Promise.resolve({ numPages: 3 }) });

    await expect(getPdfPageCount(fakeFile())).resolves.toBe(3);

    expect(warn).toHaveBeenCalledWith(expect.stringContaining("pdf.js"), expect.any(Error));
  });
});
