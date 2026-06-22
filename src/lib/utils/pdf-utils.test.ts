import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

vi.mock("pdfjs-dist/build/pdf.worker.min.mjs?url", () => ({ default: "mock-worker-url" }));

const getDocument = vi.fn();

vi.mock("pdfjs-dist", () => ({
  GlobalWorkerOptions: { workerSrc: "" },
  getDocument: (...args: unknown[]) => getDocument(...args),
}));

import { parsePdf, renderPdfPage, getPdfPageCount } from "./pdf-utils";

function makePage(text: string) {
  return {
    getTextContent: vi.fn().mockResolvedValue({ items: text.split(" ").map((str) => ({ str })) }),
    getViewport: vi.fn().mockReturnValue({ width: 100, height: 200 }),
    render: vi.fn().mockReturnValue({ promise: Promise.resolve() }),
    cleanup: vi.fn(),
  };
}

function fakeFile() {
  return new File([new Uint8Array([0x25, 0x50, 0x44, 0x46])], "f.pdf", { type: "application/pdf" });
}

beforeEach(() => {
  getDocument.mockReset();
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

  it("truncates text when full text exceeds MAX_TEXT_CHARS", async () => {
    const longChunk = "x".repeat(9000);
    const pages = [makePage(longChunk)];
    getDocument.mockReturnValue({
      promise: Promise.resolve({
        numPages: 1,
        getPage: () => Promise.resolve(pages[0]),
      }),
    });

    const result = await parsePdf(fakeFile());
    expect(result.text).toMatch(/\[\.\.\. texto truncado\]$/);
    expect(result.text.length).toBeLessThanOrEqual(8000 + "[... texto truncado]".length + 5);
    expect(result.truncated).toBe(true);
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
