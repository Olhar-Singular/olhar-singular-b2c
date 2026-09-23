import { describe, it, expect } from "vitest";
import {
  nextImageName,
  registerAndGenerateDsl,
  resolveImageSrc,
  scanAndRegisterUrls,
  expandImageRegistry,
  chooseImageEncoding,
  fitToPrintResolution,
  MAX_IMAGE_DIMENSION_PX,
  type ImageItem,
} from "./imageManagerUtils";

describe("nextImageName", () => {
  it("returns imagem-1 for empty registry", () => {
    expect(nextImageName({})).toBe("imagem-1");
  });
  it("skips existing names", () => {
    expect(nextImageName({ "imagem-1": "a", "imagem-2": "b" })).toBe("imagem-3");
  });
  it("does not get confused by gaps in numbering", () => {
    expect(nextImageName({ "imagem-1": "a" })).toBe("imagem-2");
  });
});

describe("registerAndGenerateDsl", () => {
  it("generates [img:name] line per image, default alignment left omitted", () => {
    const images: ImageItem[] = [{ id: "x", src: "https://a.png", align: "left" }];
    const out = registerAndGenerateDsl(images, {});
    expect(out.dsl).toBe("[img:imagem-1]");
    expect(out.updatedRegistry["imagem-1"]).toBe("https://a.png");
  });

  it("appends align=<value> for non-left alignment", () => {
    const images: ImageItem[] = [
      { id: "x", src: "https://a.png", align: "center" },
      { id: "y", src: "https://b.png", align: "right" },
    ];
    const out = registerAndGenerateDsl(images, {});
    expect(out.dsl).toContain("[img:imagem-1 align=center]");
    expect(out.dsl).toContain("[img:imagem-2 align=right]");
  });

  it("does not mutate the input registry", () => {
    const reg = { "imagem-1": "existing" };
    registerAndGenerateDsl([{ id: "x", src: "y", align: "left" }], reg);
    expect(reg).toEqual({ "imagem-1": "existing" });
  });
});

describe("resolveImageSrc", () => {
  it("returns the registered URL for a known reference", () => {
    expect(resolveImageSrc("imagem-1", { "imagem-1": "https://x.png" })).toBe("https://x.png");
  });
  it("returns the input as-is when reference is not in registry", () => {
    expect(resolveImageSrc("imagem-9", {})).toBe("imagem-9");
  });
});

describe("scanAndRegisterUrls", () => {
  it("returns null when text has no inline image URLs", () => {
    expect(scanAndRegisterUrls("plain text [img:imagem-1]", {})).toBeNull();
  });

  it("registers a new https URL and rewrites the text with the alias", () => {
    const out = scanAndRegisterUrls("foo [img:https://x.png] bar", {});
    expect(out).not.toBeNull();
    expect(out!.cleanText).toContain("[img:imagem-1]");
    expect(out!.updatedRegistry["imagem-1"]).toBe("https://x.png");
  });

  it("registers a data: URL", () => {
    const out = scanAndRegisterUrls("[img:data:image/png;base64,AAA]", {});
    expect(out!.updatedRegistry["imagem-1"]).toBe("data:image/png;base64,AAA");
  });

  it("reuses existing alias when the same URL appears twice across calls", () => {
    const first = scanAndRegisterUrls("[img:https://x.png]", {});
    const second = scanAndRegisterUrls("[img:https://x.png]", first!.updatedRegistry);
    expect(Object.keys(second!.updatedRegistry)).toHaveLength(1);
  });

  it("preserves trailing parameters like align=center", () => {
    const out = scanAndRegisterUrls("[img:https://x.png align=center]", {});
    expect(out!.cleanText).toContain("[img:imagem-1 align=center]");
  });
});

describe("expandImageRegistry", () => {
  it("expands aliases into full URLs", () => {
    const out = expandImageRegistry("[img:imagem-1]", { "imagem-1": "https://x.png" });
    expect(out).toBe("[img:https://x.png]");
  });

  it("leaves URL-shaped references untouched (https / data)", () => {
    expect(expandImageRegistry("[img:https://x.png]", {})).toBe("[img:https://x.png]");
    expect(expandImageRegistry("[img:data:image/png;base64,AA]", {})).toBe("[img:data:image/png;base64,AA]");
  });

  it("leaves unknown aliases untouched", () => {
    expect(expandImageRegistry("[img:imagem-99]", {})).toBe("[img:imagem-99]");
  });

  it("leaves alias with empty registered URL untouched", () => {
    expect(expandImageRegistry("[img:imagem-1]", { "imagem-1": "" })).toBe("[img:imagem-1]");
  });

  it("preserves trailing parameters when expanding", () => {
    const out = expandImageRegistry("[img:imagem-1 align=center]", { "imagem-1": "https://x.png" });
    expect(out).toBe("[img:https://x.png align=center]");
  });
});

describe("chooseImageEncoding", () => {
  it("keeps alpha-capable formats as PNG so transparency is not flattened", () => {
    for (const type of ["image/png", "image/gif", "image/webp", "image/avif", "image/svg+xml"]) {
      expect(chooseImageEncoding(type)).toEqual({ mime: "image/png", quality: undefined });
    }
  });

  it("is case insensitive", () => {
    expect(chooseImageEncoding("IMAGE/PNG").mime).toBe("image/png");
  });

  it("encodes JPEG input as JPEG with quality", () => {
    expect(chooseImageEncoding("image/jpeg")).toEqual({ mime: "image/jpeg", quality: 0.85 });
  });

  it("falls back to JPEG for unknown types", () => {
    expect(chooseImageEncoding("").mime).toBe("image/jpeg");
  });
});

describe("fitToPrintResolution", () => {
  it("keeps enough pixels for 300 ppi across the printed text column", () => {
    // 0320: a coluna impressa mede 515,28pt (A4 595,28pt menos 40pt de cada
    // margem) = 7,157in. A 300 ppi isso exige ~2148px de origem.
    expect(MAX_IMAGE_DIMENSION_PX).toBeGreaterThanOrEqual(2147);
  });

  it("does not shrink a scan that already fits the print budget", () => {
    expect(fitToPrintResolution(2000, 1500)).toEqual({ width: 2000, height: 1500 });
  });

  it("shrinks only what exceeds the budget, preserving the aspect ratio", () => {
    const { width, height } = fitToPrintResolution(8000, 4000);
    expect(width).toBe(MAX_IMAGE_DIMENSION_PX);
    expect(height).toBe(Math.round(MAX_IMAGE_DIMENSION_PX / 2));
  });

  it("caps by the taller side when the image is portrait", () => {
    const { width, height } = fitToPrintResolution(4000, 8000);
    expect(height).toBe(MAX_IMAGE_DIMENSION_PX);
    expect(width).toBe(Math.round(MAX_IMAGE_DIMENSION_PX / 2));
  });
});
