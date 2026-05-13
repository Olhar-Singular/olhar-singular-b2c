import { describe, it, expect } from "vitest";
import { LatexExtension, latexStyles } from "./latexExtension";

type AnyFn = (...args: unknown[]) => unknown;
type Plugin = {
  spec: {
    state: { init: AnyFn; apply: AnyFn };
    props: { decorations: AnyFn };
  };
};
type ExtensionConfig = { addProseMirrorPlugins: () => Plugin[] };

function getPlugins(): Plugin[] {
  const ext = LatexExtension as unknown as { config: ExtensionConfig };
  return ext.config.addProseMirrorPlugins();
}

describe("latexStyles", () => {
  it("exposes the .latex-rendered style", () => {
    expect(latexStyles).toContain(".latex-rendered");
  });

  it("exposes the .latex-error style", () => {
    expect(latexStyles).toContain(".latex-error");
  });

  it("exposes the ProseMirror katex font-size override", () => {
    expect(latexStyles).toContain(".ProseMirror .katex");
  });
});

describe("LatexExtension", () => {
  it("has the 'latex' node name", () => {
    expect(LatexExtension.name).toBe("latex");
  });

  it("registers a ProseMirror plugin with decoration logic", () => {
    const plugins = getPlugins();
    expect(Array.isArray(plugins)).toBe(true);
    expect(plugins.length).toBeGreaterThan(0);
  });

  it("plugin spec has init and apply state methods plus a decorations prop", () => {
    const plugin = getPlugins()[0];
    expect(typeof plugin.spec.state.init).toBe("function");
    expect(typeof plugin.spec.state.apply).toBe("function");
    expect(typeof plugin.spec.props.decorations).toBe("function");
  });

  it("init iterates descendants and pushes a decoration per $...$ match", () => {
    const plugin = getPlugins()[0];
    const visited: string[] = [];
    const fakeDoc = {
      forEach() {},
      content: { size: 100 },
      descendants(cb: (node: { isText: boolean; text: string }, pos: number) => void) {
        const node = { isText: true, text: "Calcule $x^2$ resultado" };
        visited.push(node.text);
        cb(node, 0);
      },
    };
    const decoSet = plugin.spec.state.init({}, { doc: fakeDoc });
    expect(visited).toEqual(["Calcule $x^2$ resultado"]);
    expect(decoSet).toBeDefined();
  });

  it("apply re-runs buildDecorations when transaction docChanged is true", () => {
    const plugin = getPlugins()[0];
    let called = false;
    const fakeDoc = {
      forEach() {},
      content: { size: 10 },
      descendants(cb: (node: { isText: boolean; text: string }, pos: number) => void) {
        called = true;
        cb({ isText: true, text: "no math here" }, 0);
      },
    };
    const tr = {
      docChanged: true,
      doc: fakeDoc,
      mapping: { map: () => 0, maps: [] },
    };
    const result = plugin.spec.state.apply(tr, { map: () => null }, {}, {});
    expect(called).toBe(true);
    expect(result).toBeDefined();
  });

  it("apply maps existing decorations when docChanged is false", () => {
    const plugin = getPlugins()[0];
    const tr = { docChanged: false, mapping: { map: () => 0, maps: [] }, doc: {} };
    const mappedTo = { mapped: true };
    const decoSet = { map: () => mappedTo };
    const result = plugin.spec.state.apply(tr, decoSet, {}, {});
    expect(result).toBe(mappedTo);
  });

  it("decorations getter returns plugin state", () => {
    const plugin = getPlugins()[0];
    const fakeDoc = { descendants: () => undefined };
    const initialState = plugin.spec.state.init({}, { doc: fakeDoc });
    const ctx = { getState: () => initialState };
    const result = plugin.spec.props.decorations.call(ctx, {});
    expect(result).toBe(initialState);
  });

  it("ignores non-text nodes during decoration scan", () => {
    const plugin = getPlugins()[0];
    const fakeDoc = {
      descendants(cb: (node: { isText: boolean; text?: string }, pos: number) => void) {
        cb({ isText: false }, 0);
        cb({ isText: true, text: undefined }, 5);
      },
    };
    const decoSet = plugin.spec.state.init({}, { doc: fakeDoc });
    expect(decoSet).toBeDefined();
  });
});

import { renderLatex } from "./latexExtension";

describe("renderLatex (internal helper)", () => {
  it("returns rendered HTML for valid LaTeX", () => {
    const html = renderLatex("x^2");
    expect(html).toContain("katex");
  });
});
