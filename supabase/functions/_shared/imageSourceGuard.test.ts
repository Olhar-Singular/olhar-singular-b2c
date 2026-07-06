import { describe, it, expect } from "vitest";
import { extractImageMarkers } from "./imageSourceGuard";

describe("extractImageMarkers", () => {
  it("extracts a single marker URL", () => {
    const set = extractImageMarkers("Questão 1\n[IMAGEM: https://x.co/a.png]");
    expect([...set]).toEqual(["https://x.co/a.png"]);
  });

  it("extracts multiple marker URLs", () => {
    const set = extractImageMarkers("[IMAGEM: https://x.co/a.png]\n[IMAGEM: https://x.co/b.png]");
    expect(set.has("https://x.co/a.png")).toBe(true);
    expect(set.has("https://x.co/b.png")).toBe(true);
    expect(set.size).toBe(2);
  });

  it("returns an empty set when there are no markers", () => {
    expect(extractImageMarkers("nenhuma imagem aqui").size).toBe(0);
  });

  it("trims whitespace inside the marker", () => {
    const set = extractImageMarkers("[IMAGEM:   https://x.co/a.png   ]");
    expect([...set]).toEqual(["https://x.co/a.png"]);
  });

  it("HTML-unescapes an escaped '&' so it matches the raw URL", () => {
    // sanitize() turns `&` into `&amp;`; the allowlist must hold the decoded form.
    const set = extractImageMarkers("[IMAGEM: https://x.co/a.png?w=1&amp;h=2]");
    expect([...set]).toEqual(["https://x.co/a.png?w=1&h=2"]);
  });

  it("skips a marker whose URL is blank after trimming", () => {
    expect(extractImageMarkers("[IMAGEM:   ]").size).toBe(0);
  });
});

import { stripFabricatedImages } from "./imageSourceGuard";
import type { AdaptationResult, Block } from "../../../src/lib/adaptation/canonical/schema";

const UID = {
  a: "11111111-1111-1111-1111-111111111111",
  b: "22222222-2222-2222-2222-222222222222",
  c: "33333333-3333-3333-3333-333333333333",
};

function resultWith(blocks: Block[]): AdaptationResult {
  return {
    schemaVersion: 1,
    document: { schemaVersion: 1, blocks },
    strategies_applied: [],
    pedagogical_justification: "",
    implementation_tips: [],
  };
}

const imageBlock = (id: string, src: string, alt: string): Block =>
  ({ id, type: "image", src, alt }) as Block;

describe("stripFabricatedImages", () => {
  it("keeps an image whose src is in the allowlist", () => {
    const res = resultWith([imageBlock(UID.a, "https://x.co/a.png", "bola")]);
    const out = stripFabricatedImages(res, new Set(["https://x.co/a.png"]));
    expect(out.document.blocks[0]).toEqual(res.document.blocks[0]);
  });

  it("rewrites a fabricated image into a paragraph carrying the alt", () => {
    const res = resultWith([imageBlock(UID.a, "https://i.ibb.co/fake.png", "2 bolas azuis")]);
    const out = stripFabricatedImages(res, new Set());
    expect(out.document.blocks[0]).toEqual({
      id: UID.a,
      type: "paragraph",
      content: [{ type: "text", text: "2 bolas azuis" }],
    });
  });

  it("uses empty content when the fabricated image has a blank alt", () => {
    const res = resultWith([imageBlock(UID.a, "https://i.ibb.co/fake.png", "   ")]);
    const out = stripFabricatedImages(res, new Set());
    expect(out.document.blocks[0]).toEqual({ id: UID.a, type: "paragraph", content: [] });
  });

  it("preserves the image style on the replacement paragraph", () => {
    const styled = { ...imageBlock(UID.a, "https://i.ibb.co/fake.png", "x"), style: { align: "center" } } as Block;
    const out = stripFabricatedImages(resultWith([styled]), new Set());
    expect(out.document.blocks[0]).toEqual({
      id: UID.a,
      type: "paragraph",
      content: [{ type: "text", text: "x" }],
      style: { align: "center" },
    });
  });

  it("rewrites a fabricated image inside a question stem", () => {
    const question = {
      id: UID.b,
      type: "question",
      stem: [imageBlock(UID.c, "https://i.ibb.co/fake.png", "figura")],
      answer: { kind: "open" },
    } as Block;
    const out = stripFabricatedImages(resultWith([question]), new Set());
    const stem = (out.document.blocks[0] as Extract<Block, { type: "question" }>).stem;
    expect(stem[0]).toEqual({ id: UID.c, type: "paragraph", content: [{ type: "text", text: "figura" }] });
  });

  it("strips all images when the allowlist is empty (manual paste)", () => {
    const res = resultWith([imageBlock(UID.a, "https://x.co/a.png", "a")]);
    const out = stripFabricatedImages(res, new Set());
    expect((out.document.blocks[0] as { type: string }).type).toBe("paragraph");
  });

  it("matches an allowed url even if the image src is HTML-escaped", () => {
    const res = resultWith([imageBlock(UID.a, "https://x.co/a.png?w=1&amp;h=2", "a")]);
    const out = stripFabricatedImages(res, new Set(["https://x.co/a.png?w=1&h=2"]));
    expect((out.document.blocks[0] as { type: string }).type).toBe("image");
  });

  it("leaves non-image blocks untouched", () => {
    const para = { id: UID.a, type: "paragraph", content: [{ type: "text", text: "hi" }] } as Block;
    const out = stripFabricatedImages(resultWith([para]), new Set());
    expect(out.document.blocks[0]).toEqual(para);
  });
});
