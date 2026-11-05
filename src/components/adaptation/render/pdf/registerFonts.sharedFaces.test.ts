import { describe, it, expect } from "vitest";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { PDF_FONT_REGISTRATIONS, shareAliasedFaces } from "./registerFonts";

type Source = { src: string; data: unknown; load: () => Promise<void> };
const fakeSource = (src: string, data: unknown): Source => {
  const source: Source = {
    src,
    data: null,
    load: async () => {
      source.data = data;
    },
  };
  return source;
};

describe("shareAliasedFaces (F-L: Lexend perdia uma letra no 2º export)", () => {
  it("makes the faces that point at the same file use ONE parsed font", async () => {
    const regular = fakeSource("/fonts/A.ttf", { name: "first" });
    const alias = fakeSource("/fonts/A.ttf", { name: "second" });
    const other = fakeSource("/fonts/B.ttf", { name: "other" });
    shareAliasedFaces({ Fam: { sources: [regular, alias, other] } });

    await alias.load();
    await regular.load();
    await other.load();
    expect(alias.data).toBe(regular.data);
    expect(other.data).not.toBe(regular.data);
  });

  it("loads the shared font once, even if the alias is asked for first", async () => {
    let loads = 0;
    const regular: Source = {
      src: "/fonts/A.ttf",
      data: null,
      load: async () => {
        loads += 1;
        regular.data = { n: loads };
      },
    };
    const alias = fakeSource("/fonts/A.ttf", { never: true });
    shareAliasedFaces({ Fam: { sources: [regular, alias] } });
    await alias.load();
    expect(alias.data).toEqual({ n: 1 });
    expect(loads).toBe(1);
  });

  it("does not touch families whose faces all have their own file", async () => {
    const a = fakeSource("/fonts/A.ttf", { a: 1 });
    const b = fakeSource("/fonts/B.ttf", { b: 1 });
    const originalLoad = b.load;
    shareAliasedFaces({ Fam: { sources: [a, b] } });
    expect(b.load).toBe(originalLoad);
  });
});

describe("a real font store never holds two parsed copies of the same file", () => {
  it("covers Lexend italics, OpenDyslexic bold-italic and the symbol fonts", async () => {
    const store = createPdfFontStore() as unknown as {
      load: (d: object) => Promise<void>;
      getFont: (d: object) => { data: unknown };
    };
    const aliased: { family: string; weight: "normal" | "bold"; style: "normal" | "italic"; primary: [string, string] }[] = [];
    for (const { family, fonts } of PDF_FONT_REGISTRATIONS) {
      const seen = new Map<string, (typeof fonts)[number]>();
      for (const face of fonts) {
        const first = seen.get(face.src);
        if (!first) seen.set(face.src, face);
        else aliased.push({ family, weight: face.fontWeight, style: face.fontStyle, primary: [first.fontWeight, first.fontStyle] });
      }
    }
    expect(aliased.map((a) => a.family)).toEqual(
      expect.arrayContaining(["Lexend", "OpenDyslexic"]),
    );
    for (const a of aliased) {
      const descriptor = (weight: string, style: string) => ({ fontFamily: a.family, fontWeight: weight === "bold" ? 700 : 400, fontStyle: style });
      const alias = descriptor(a.weight, a.style);
      const primary = descriptor(...a.primary);
      await store.load(alias);
      await store.load(primary);
      expect(store.getFont(alias).data).toBe(store.getFont(primary).data);
    }
  });
});
