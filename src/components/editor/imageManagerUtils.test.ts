import { describe, it, expect } from "vitest";
import {
  nextImageName,
  registerAndGenerateDsl,
  resolveImageSrc,
  scanAndRegisterUrls,
  expandImageRegistry,
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
