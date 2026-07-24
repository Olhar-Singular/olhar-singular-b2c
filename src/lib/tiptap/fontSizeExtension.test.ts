import { describe, it, expect } from "vitest";
import { FontSize, normalizeFontSize } from "./fontSizeExtension";

type AttrSpec = {
  default: null;
  parseHTML: (el: HTMLElement) => string | null;
  renderHTML: (attrs: Record<string, unknown>) => Record<string, string>;
};

type GlobalAttrEntry = {
  types: string[];
  attributes: Record<string, AttrSpec>;
};

type CommandFn = (size: string) => (ctx: { chain: () => Record<string, (...a: unknown[]) => unknown> }) => unknown;
type UnsetFn = () => (ctx: { chain: () => Record<string, (...a: unknown[]) => unknown> }) => unknown;

type ExtConfig = {
  addOptions: () => { types: string[] };
  addGlobalAttributes: () => GlobalAttrEntry[];
  addCommands: () => { setFontSize: CommandFn; unsetFontSize: UnsetFn };
};

function cfg() {
  return (FontSize as unknown as { config: ExtConfig }).config;
}

/** Call addGlobalAttributes with the correct `this` context (needs this.options). */
function getGlobalAttrs() {
  const c = cfg();
  const options = c.addOptions();
  return c.addGlobalAttributes.call({ options });
}

function makeChain() {
  const ops: Array<{ name: string; args: unknown[] }> = [];
  const chain: Record<string, (...a: unknown[]) => typeof chain> = {};
  for (const m of ["setMark", "removeEmptyTextStyle", "run"]) {
    chain[m] = (...args: unknown[]) => {
      ops.push({ name: m, args });
      return chain;
    };
  }
  return { chain, ops };
}

describe("FontSize extension", () => {
  it("has name 'fontSize'", () => {
    expect(FontSize.name).toBe("fontSize");
  });

  it("defaults to types: ['textStyle']", () => {
    expect(cfg().addOptions().types).toEqual(["textStyle"]);
  });

  describe("addGlobalAttributes", () => {
    function entry() {
      return getGlobalAttrs()[0];
    }

    it("targets textStyle", () => {
      expect(entry().types).toEqual(["textStyle"]);
    });

    it("fontSize default is null", () => {
      expect(entry().attributes.fontSize.default).toBeNull();
    });

    it("parseHTML extracts style.fontSize", () => {
      const el = { style: { fontSize: "16px" } } as unknown as HTMLElement;
      expect(entry().attributes.fontSize.parseHTML(el)).toBe("16px");
    });

    it("parseHTML returns null for empty style.fontSize", () => {
      const el = { style: { fontSize: "" } } as unknown as HTMLElement;
      expect(entry().attributes.fontSize.parseHTML(el)).toBeNull();
    });

    it("renderHTML returns style string when fontSize is set", () => {
      expect(entry().attributes.fontSize.renderHTML({ fontSize: "18px" })).toEqual({
        style: "font-size: 18px",
      });
    });

    it("renderHTML returns empty object when fontSize is null", () => {
      expect(entry().attributes.fontSize.renderHTML({ fontSize: null })).toEqual({});
    });

    it("renderHTML returns empty object when fontSize is undefined", () => {
      expect(entry().attributes.fontSize.renderHTML({ fontSize: undefined })).toEqual({});
    });
  });

  describe("addCommands", () => {
    it("setFontSize calls chain().setMark('textStyle', { fontSize })", () => {
      const { chain, ops } = makeChain();
      cfg().addCommands().setFontSize("20px")({ chain: () => chain });
      const call = ops.find((o) => o.name === "setMark");
      expect(call?.args).toEqual(["textStyle", { fontSize: "20px" }]);
    });

    it("unsetFontSize calls setMark with null fontSize and removeEmptyTextStyle", () => {
      const { chain, ops } = makeChain();
      cfg().addCommands().unsetFontSize()({ chain: () => chain });
      const setMark = ops.find((o) => o.name === "setMark");
      expect(setMark?.args).toEqual(["textStyle", { fontSize: null }]);
      expect(ops.some((o) => o.name === "removeEmptyTextStyle")).toBe(true);
    });
  });
});

/**
 * The canonical mapper reads this attribute with `parseFloat` and treats the
 * number as PIXELS. Anything that reaches it in another unit is therefore not
 * "slightly off" — it is a different size. A pasted `12pt` used to land as 9pt
 * on the sheet and in the PDF, with nothing to show for it.
 */
describe("normalizeFontSize", () => {
  it("passes px through untouched", () => {
    expect(normalizeFontSize("16px")).toBe("16px");
    expect(normalizeFontSize("14.5px")).toBe("14.5px");
  });

  it("converts pt to px (72pt = 96px) so the size survives a paste", () => {
    expect(normalizeFontSize("12pt")).toBe("16px");
    expect(normalizeFontSize("18pt")).toBe("24px");
  });

  it("tolerates whitespace and unit casing", () => {
    expect(normalizeFontSize("  12PT ")).toBe("16px");
    expect(normalizeFontSize("16 px")).toBe("16px");
  });

  it("trims floating-point noise instead of emitting 16.000000000000004px", () => {
    expect(normalizeFontSize("11pt")).toBe("14.6667px");
  });

  it("returns null for units it cannot convert exactly (text inherits instead)", () => {
    expect(normalizeFontSize("1.5em")).toBeNull();
    expect(normalizeFontSize("120%")).toBeNull();
    expect(normalizeFontSize("larger")).toBeNull();
    expect(normalizeFontSize("2rem")).toBeNull();
    expect(normalizeFontSize("")).toBeNull();
  });

  it("returns null for a non-positive size and for non-strings", () => {
    expect(normalizeFontSize("0px")).toBeNull();
    expect(normalizeFontSize("-4px")).toBeNull();
    expect(normalizeFontSize(null)).toBeNull();
    expect(normalizeFontSize(16)).toBeNull();
  });
});
