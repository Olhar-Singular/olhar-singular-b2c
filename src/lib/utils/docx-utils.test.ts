import { describe, it, expect, vi, beforeEach } from "vitest";

const extractRawText = vi.fn();
const convertToHtml = vi.fn();
const imgElement = vi.fn();

vi.mock("mammoth", () => ({
  default: {
    extractRawText: (...args: unknown[]) => extractRawText(...args),
    convertToHtml: (...args: unknown[]) => convertToHtml(...args),
    images: {
      imgElement: (handler: unknown) => imgElement(handler),
    },
  },
}));

import { extractDocxText, extractDocxWithImages, isDocxFile } from "./docx-utils";

function fakeFile(bytes: Uint8Array | number[]): File {
  const buf = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  return new File([buf], "test.docx", {
    type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  });
}

beforeEach(() => {
  extractRawText.mockReset();
  convertToHtml.mockReset();
  imgElement.mockReset();
});

describe("extractDocxText", () => {
  it("returns the value field from mammoth.extractRawText", async () => {
    extractRawText.mockResolvedValue({ value: "raw text" });
    const file = fakeFile([0x50, 0x4b, 0x03, 0x04, 0x00]);
    const out = await extractDocxText(file);
    expect(out).toBe("raw text");
    expect(extractRawText).toHaveBeenCalled();
  });
});

describe("extractDocxWithImages", () => {
  it("returns combined text + base64 images, skipping wmf/emf images", async () => {
    convertToHtml.mockImplementation(async (_args, opts: { convertImage: unknown }) => {
      // Simulate mammoth invoking the imgElement handler we passed in.
      const handler = imgElement.mock.calls[0]?.[0] as
        | ((image: { contentType: string; read: (enc: string) => Promise<string> }) => Promise<{ src: string }>)
        | undefined;
      if (handler) {
        const png = await handler({
          contentType: "image/png",
          read: (_enc) => Promise.resolve("AAAA"),
        });
        const wmf = await handler({
          contentType: "image/wmf",
          read: (_enc) => Promise.resolve("BBBB"),
        });
        // sanity: the wmf returned src should be empty
        expect(wmf.src).toBe("");
        expect(png.src).toContain("data:image/png;base64,AAAA");
      }
      void opts;
      return { value: "<p>html</p>" };
    });
    extractRawText.mockResolvedValue({ value: "txt" });

    const file = fakeFile([0x50, 0x4b, 0x03, 0x04]);
    const out = await extractDocxWithImages(file);
    expect(out.text).toBe("txt");
    expect(out.images).toHaveLength(1);
    expect(out.images[0]).toContain("data:image/png;base64,AAAA");
  });

  it("falls back to image/png when contentType is missing", async () => {
    convertToHtml.mockImplementation(async (_args, _opts) => {
      const handler = imgElement.mock.calls[0]?.[0] as
        | ((image: { contentType?: string; read: (enc: string) => Promise<string> }) => Promise<{ src: string }>)
        | undefined;
      const out = await handler!({ read: () => Promise.resolve("ZZZZ") });
      expect(out.src).toContain("data:image/png");
      return { value: "" };
    });
    extractRawText.mockResolvedValue({ value: "" });
    await extractDocxWithImages(fakeFile([0x50, 0x4b, 0x03, 0x04]));
  });
});

describe("isDocxFile", () => {
  it("resolves true when first 4 bytes are PK\\x03\\x04 (ZIP signature)", async () => {
    const file = fakeFile([0x50, 0x4b, 0x03, 0x04, 0xff, 0xff]);
    await expect(isDocxFile(file)).resolves.toBe(true);
  });

  it("resolves false when signature does not match", async () => {
    const file = fakeFile([0x00, 0x00, 0x00, 0x00]);
    await expect(isDocxFile(file)).resolves.toBe(false);
  });

  it("resolves false when reader errors", async () => {
    const file = fakeFile([0x50]);
    // Force FileReader.onerror by overriding readAsArrayBuffer
    const origReader = globalThis.FileReader;
    class BrokenReader {
      onload: (() => void) | null = null;
      onerror: (() => void) | null = null;
      result: ArrayBuffer | null = null;
      readAsArrayBuffer() {
        queueMicrotask(() => this.onerror?.());
      }
    }
    (globalThis as { FileReader: unknown }).FileReader = BrokenReader as unknown;
    try {
      await expect(isDocxFile(file)).resolves.toBe(false);
    } finally {
      (globalThis as { FileReader: unknown }).FileReader = origReader;
    }
  });
});
