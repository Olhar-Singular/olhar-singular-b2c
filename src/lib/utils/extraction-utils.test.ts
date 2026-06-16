import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeTextForDedup,
  findDuplicates,
  dataUrlToBlob,
  autoCropFromBbox,
  fetchWithRetry,
  stripOptionMarker,
} from "./extraction-utils";

describe("stripOptionMarker", () => {
  it("strips lowercase letter marker with paren", () => {
    expect(stripOptionMarker("a) sucos.")).toBe("sucos.");
  });
  it("strips uppercase letter marker with paren", () => {
    expect(stripOptionMarker("B) sanduíches.")).toBe("sanduíches.");
  });
  it("strips letter marker with dot", () => {
    expect(stripOptionMarker("c. garrafa de água")).toBe("garrafa de água");
  });
  it("strips parenthesized marker", () => {
    expect(stripOptionMarker("(d) bebidas açucaradas")).toBe("bebidas açucaradas");
  });
  it("strips dash-style marker", () => {
    expect(stripOptionMarker("a - primeira opção")).toBe("primeira opção");
  });
  it("strips numeric marker", () => {
    expect(stripOptionMarker("1) primeira")).toBe("primeira");
  });
  it("leaves text without a marker untouched", () => {
    expect(stripOptionMarker("A bola é azul")).toBe("A bola é azul");
  });
  it("leaves a sentence that merely starts with a letter untouched", () => {
    expect(stripOptionMarker("Verdadeiro")).toBe("Verdadeiro");
  });
  it("does not empty an option that is only a marker", () => {
    expect(stripOptionMarker("a)")).toBe("a)");
  });
  it("trims surrounding whitespace", () => {
    expect(stripOptionMarker("  a) sucos.  ")).toBe("sucos.");
  });
  it("returns empty string unchanged", () => {
    expect(stripOptionMarker("")).toBe("");
  });
});

describe("normalizeTextForDedup", () => {
  it("lowercases text", () => {
    expect(normalizeTextForDedup("QUESTÃO")).toBe("questão");
  });
  it("collapses multiple spaces", () => {
    expect(normalizeTextForDedup("a   b   c")).toBe("a b c");
  });
  it("trims leading/trailing whitespace", () => {
    expect(normalizeTextForDedup("  texto  ")).toBe("texto");
  });
  it("applies NFKC normalization", () => {
    // fi ligature (U+FB01) → "fi"
    expect(normalizeTextForDedup("ﬁ")).toBe("fi");
  });
  it("normalizes newlines/tabs as spaces", () => {
    expect(normalizeTextForDedup("linha1\nlinha2\ttab")).toBe("linha1 linha2 tab");
  });
});

describe("findDuplicates", () => {
  const existing = [
    { text: "Calcule a velocidade" },
    { text: "  Qual é a capital?  " },
  ];

  it("returns empty set when no duplicates", () => {
    const newQ = [{ text: "Uma questão nova" }];
    expect(findDuplicates(newQ, existing).size).toBe(0);
  });

  it("detects exact duplicate (case-insensitive)", () => {
    const newQ = [{ text: "CALCULE A VELOCIDADE" }];
    const dupes = findDuplicates(newQ, existing);
    expect(dupes.has(0)).toBe(true);
  });

  it("detects duplicate ignoring extra whitespace", () => {
    const newQ = [{ text: "  qual é a capital?  " }];
    const dupes = findDuplicates(newQ, existing);
    expect(dupes.has(0)).toBe(true);
  });

  it("returns indices of ALL duplicates", () => {
    const newQ = [
      { text: "Uma questão nova" },
      { text: "Calcule a velocidade" },
      { text: "Outra nova" },
      { text: "Qual é a capital?" },
    ];
    const dupes = findDuplicates(newQ, existing);
    expect(dupes.has(0)).toBe(false);
    expect(dupes.has(1)).toBe(true);
    expect(dupes.has(2)).toBe(false);
    expect(dupes.has(3)).toBe(true);
  });
});

describe("dataUrlToBlob", () => {
  it("converts a PNG data URL to a Blob", () => {
    // minimal 1x1 transparent PNG data URL
    const dataUrl =
      "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/png");
    expect(blob.size).toBeGreaterThan(0);
  });

  it("converts a JPEG data URL to a Blob", () => {
    // same PNG data URL but declared as JPEG — tests MIME mapping, not image validity
    const dataUrl =
      "data:image/jpeg;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
    const blob = dataUrlToBlob(dataUrl);
    expect(blob).toBeInstanceOf(Blob);
    expect(blob.type).toBe("image/jpeg");
  });

  it("falls back to image/png when MIME marker is missing in the meta", () => {
    const data = "data:base64,aGVsbG8="; // base64 of "hello"
    const blob = dataUrlToBlob(data);
    expect(blob.type).toBe("image/png");
  });
});

function installFakeImage(behaviour: "load" | "error", naturalWidth = 100, naturalHeight = 200) {
  class FakeImage {
    crossOrigin = "";
    onload: (() => void) | null = null;
    onerror: ((err: unknown) => void) | null = null;
    naturalWidth = naturalWidth;
    naturalHeight = naturalHeight;
    set src(_v: string) {
      queueMicrotask(() => {
        if (behaviour === "load") this.onload?.();
        else this.onerror?.(new Error("fail"));
      });
    }
  }
  (globalThis as { Image: unknown }).Image = FakeImage as unknown;
}

describe("autoCropFromBbox", () => {
  let originalImage: typeof globalThis.Image;
  let originalCreateElement: typeof document.createElement;

  beforeEach(() => {
    originalImage = (globalThis as { Image: typeof globalThis.Image }).Image;
    originalCreateElement = document.createElement.bind(document);
    document.createElement = ((tag: string) => {
      if (tag === "canvas") {
        return {
          width: 0,
          height: 0,
          getContext: () => ({
            fillStyle: "",
            fillRect: vi.fn(),
            drawImage: vi.fn(),
          }),
          toDataURL: () => "data:image/png;base64,FAKE",
        } as unknown as HTMLCanvasElement;
      }
      return originalCreateElement(tag);
    }) as typeof document.createElement;
  });

  afterEach(() => {
    (globalThis as { Image: typeof globalThis.Image }).Image = originalImage;
    document.createElement = originalCreateElement;
  });

  it("resolves with a cropped data URL when image loads", async () => {
    installFakeImage("load");
    const result = await autoCropFromBbox("http://example/img.png", {
      x: 0.1,
      y: 0.1,
      width: 0.5,
      height: 0.5,
    });
    expect(result).toContain("data:image/png");
  });

  it("rejects when the image fails to load", async () => {
    installFakeImage("error");
    await expect(
      autoCropFromBbox("http://example/img.png", { x: 0, y: 0, width: 1, height: 1 }),
    ).rejects.toThrow(/Failed to load/);
  });
});

describe("fetchWithRetry", () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it("returns the response on first successful attempt", async () => {
    const mockResp = new Response("ok", { status: 200 });
    const fetchMock = vi.fn().mockResolvedValue(mockResp);
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const promise = fetchWithRetry("http://x", undefined, 3);
    const resp = await promise;
    expect(resp).toBe(mockResp);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("retries on non-OK status and returns once successful", async () => {
    const failResp = new Response("nope", { status: 500 });
    const okResp = new Response("ok", { status: 200 });
    const fetchMock = vi.fn().mockResolvedValueOnce(failResp).mockResolvedValueOnce(okResp);
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const promise = fetchWithRetry("http://x", undefined, 3);
    await vi.advanceTimersByTimeAsync(1000);
    const resp = await promise;
    expect(resp).toBe(okResp);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("throws HTTP <status> after exhausting retries on non-OK", async () => {
    const failResp = new Response("nope", { status: 503 });
    const fetchMock = vi.fn().mockResolvedValue(failResp);
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const promise = fetchWithRetry("http://x", undefined, 2);
    const assertion = expect(promise).rejects.toThrow(/HTTP 503/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
  });

  it("retries on thrown errors and bubbles the last one", async () => {
    const fetchMock = vi
      .fn()
      .mockRejectedValueOnce(new Error("net1"))
      .mockRejectedValueOnce(new Error("net2"));
    (globalThis as { fetch: typeof fetch }).fetch = fetchMock as unknown as typeof fetch;

    const promise = fetchWithRetry("http://x", undefined, 2);
    const assertion = expect(promise).rejects.toThrow(/net2/);
    await vi.advanceTimersByTimeAsync(1000);
    await assertion;
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
