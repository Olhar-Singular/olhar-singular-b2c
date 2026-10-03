import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  normalizeTextForDedup,
  findDuplicates,
  dataUrlToBlob,
  autoCropFromBbox,
  fetchWithRetry,
  stripOptionMarker,
  stripOptionsFromText,
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

describe("stripOptionsFromText", () => {
  it("removes option lines (parenthesized markers) when options are present", () => {
    const text = "A que mudança o personagem está se referindo?\n(A) Descartar o lixo.\n(B) Não desperdiçar água.\n(C) Mudar os móveis.\n(D) Mudar de endereço.";
    const result = stripOptionsFromText(text, true);
    expect(result).toBe("A que mudança o personagem está se referindo?");
  });

  it("removes option lines (bare paren markers) when options are present", () => {
    const text = "Esse texto é uma\nA) reportagem.\nB) entrevista.\nC) crônica.\nD) fábula.";
    expect(stripOptionsFromText(text, true)).toBe("Esse texto é uma");
  });

  it("handles multi-paragraph stem before options", () => {
    const text = "O anel de vidro\nTenho um anel de vidro...\n\nEsse trecho do poema sugere\n(A) cansaço.\n(B) tristeza.";
    expect(stripOptionsFromText(text, true)).toBe("O anel de vidro\nTenho um anel de vidro...\n\nEsse trecho do poema sugere");
  });

  it("returns original text unchanged when hasOptions is false", () => {
    const text = "Descreva o processo fotossintético.\n(A) linha que não é opção";
    expect(stripOptionsFromText(text, false)).toBe(text);
  });

  it("returns original text unchanged when no option lines are found", () => {
    const text = "Calcule a área do triângulo com base 4 e altura 3.";
    expect(stripOptionsFromText(text, true)).toBe(text);
  });

  it("handles dot-delimited markers", () => {
    const text = "Qual é a capital?\nA. Brasília\nB. São Paulo\nC. Rio\nD. Curitiba";
    expect(stripOptionsFromText(text, true)).toBe("Qual é a capital?");
  });

  it("does not strip text that merely starts with a letter word (no delimiter)", () => {
    const text = "Assinale a alternativa correta.\nApenas Brasília é capital.";
    expect(stripOptionsFromText(text, true)).toBe(text);
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
  let drawImageSpy: ReturnType<typeof vi.fn>;
  // Which source pixels are "ink" (non-white). Defaults to a fully inked page,
  // where the figure never visibly ends, so the crop extends the full padding.
  let isInk: (x: number, y: number) => boolean;

  // The 9-arg drawImage call is the crop; the 3-arg one is the page analysis.
  const cropCall = () => drawImageSpy.mock.calls.find((c) => c.length === 9)!;

  beforeEach(() => {
    drawImageSpy = vi.fn();
    isInk = () => true;
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
            drawImage: drawImageSpy,
            getImageData: (_x: number, _y: number, w: number, h: number) => {
              const data = new Uint8ClampedArray(w * h * 4);
              for (let y = 0; y < h; y++) {
                for (let x = 0; x < w; x++) {
                  const i = (y * w + x) * 4;
                  const v = isInk(x, y) ? 0 : 255;
                  data[i] = data[i + 1] = data[i + 2] = v;
                  data[i + 3] = 255;
                }
              }
              return { data, width: w, height: h };
            },
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

  it("extends up to 6% past the AI-estimated bbox while the figure keeps going (bbox imprecise, 2% routinely cropped the figure)", async () => {
    // 100x200 source image, bbox {x:.1,y:.1,w:.5,h:.5} → with 6% padding:
    // sx = (.1-.06)*100 = 4, sy = (.1-.06)*200 = 8
    // sw = (.5+.12)*100 = 62, sh = (.5+.12)*200 = 124
    installFakeImage("load", 100, 200);
    await autoCropFromBbox("http://example/img.png", { x: 0.1, y: 0.1, width: 0.5, height: 0.5 });
    const [, sx, sy, sw, sh] = cropCall();
    expect(sx).toBeCloseTo(4);
    expect(sy).toBeCloseTo(8);
    expect(sw).toBeCloseTo(62);
    expect(sh).toBeCloseTo(124);
  });

  it("does not pull neighbouring text lines into the crop when the bbox is accurate (0278)", async () => {
    // 100x200 page. Text line above (rows 50-55), figure (rows 60-99, cols 10-89),
    // text line below (rows 104-109). Old 6%-of-page padding reached rows 48-111,
    // dragging both text lines into the image.
    installFakeImage("load", 100, 200);
    isInk = (x, y) =>
      (y >= 50 && y <= 55 && x >= 5 && x <= 95) ||
      (y >= 60 && y <= 99 && x >= 10 && x <= 89) ||
      (y >= 104 && y <= 109 && x >= 5 && x <= 95);
    await autoCropFromBbox("http://example/img.png", { x: 0.1, y: 0.3, width: 0.8, height: 0.2 });
    const [, sx, sy, sw, sh] = cropCall();
    expect(sy).toBeGreaterThan(55);
    expect(sy).toBeLessThanOrEqual(60);
    expect(sy + sh).toBeLessThanOrEqual(104);
    expect(sy + sh).toBeGreaterThanOrEqual(100);
    expect(sx).toBeLessThanOrEqual(10);
    expect(sx + sw).toBeGreaterThanOrEqual(90);
  });

  it("still grows the crop to cover a figure the bbox undershot", async () => {
    // Figure really spans rows 56-103; the AI bbox says 60-100.
    installFakeImage("load", 100, 200);
    isInk = (x, y) => y >= 56 && y <= 103 && x >= 10 && x <= 89;
    await autoCropFromBbox("http://example/img.png", { x: 0.1, y: 0.3, width: 0.8, height: 0.2 });
    const [, , sy, , sh] = cropCall();
    expect(sy).toBeLessThanOrEqual(56);
    expect(sy + sh).toBeGreaterThanOrEqual(104);
  });

  it("clamps the padded crop to the image bounds instead of reading past the edge", async () => {
    // bbox flush against the top-left corner: padding would push x/y negative,
    // clamped to 0 — and the crop must not claim more width/height than exists.
    installFakeImage("load", 100, 200);
    await autoCropFromBbox("http://example/img.png", { x: 0, y: 0, width: 0.1, height: 0.1 });
    const [, sx, sy, sw, sh] = cropCall();
    expect(sx).toBe(0);
    expect(sy).toBe(0);
    expect(sw).toBeLessThanOrEqual(100);
    expect(sh).toBeLessThanOrEqual(200);
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
