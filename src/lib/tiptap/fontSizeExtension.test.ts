import { describe, it, expect } from "vitest";
import { FontSize } from "./fontSizeExtension";

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
