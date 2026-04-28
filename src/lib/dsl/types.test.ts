import { describe, it, expect } from "vitest";
import { asRawDsl, toCanonicalDsl, toRawDsl } from "./types";

describe("asRawDsl", () => {
  it("brands a plain string as RawDsl (identity at runtime)", () => {
    expect(asRawDsl("foo")).toBe("foo");
  });
});

describe("toCanonicalDsl", () => {
  it("returns input unchanged when no inline image URLs are present", () => {
    const out = toCanonicalDsl("plain DSL text", {});
    expect(out.dsl).toBe("plain DSL text");
    expect(out.registry).toEqual({});
  });

  it("registers a [img:<url>] reference and replaces it with a stable name", () => {
    const url = "https://example.com/foo.png";
    const out = toCanonicalDsl(`1) Q\n[img:${url}]\n`, {});
    expect(out.dsl).toContain("[img:imagem-1]");
    expect(out.registry["imagem-1"]).toBe(url);
  });

  it("reuses existing registry mapping when the same URL appears twice", () => {
    const url = "https://example.com/foo.png";
    const first = toCanonicalDsl(`[img:${url}]`, {});
    const second = toCanonicalDsl(`[img:${url}]`, first.registry);
    expect(second.dsl).toBe("[img:imagem-1]");
    expect(Object.keys(second.registry)).toHaveLength(1);
  });

  it("preserves passed-in registry when no scan match", () => {
    const initial = { "imagem-1": "https://x.png" };
    const out = toCanonicalDsl("nothing to scan", initial);
    expect(out.registry).toBe(initial);
  });
});

describe("toRawDsl", () => {
  it("expands a registry name back into the full URL", () => {
    const registry = { "imagem-1": "https://example.com/foo.png" };
    const out = toRawDsl("1) Q\n[img:imagem-1]\n", registry);
    expect(out).toContain("[img:https://example.com/foo.png]");
  });

  it("leaves URL-shaped references untouched", () => {
    const out = toRawDsl("[img:https://x.png]", {});
    expect(out).toBe("[img:https://x.png]");
  });

  it("leaves unknown registry names untouched", () => {
    const out = toRawDsl("[img:not-in-registry]", {});
    expect(out).toBe("[img:not-in-registry]");
  });
});
