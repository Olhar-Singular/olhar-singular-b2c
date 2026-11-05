import { describe, it, expect } from "vitest";
import { DOMSerializer, DOMParser as PMDOMParser } from "@tiptap/pm/model";
import { getEditorSchema } from "./getEditorSchema";
import { canonicalToProseMirror } from "./fromCanonical";
import { richDocument } from "./__fixtures__/richDocument";

/**
 * Regression tests for REAL ProseMirror DOM serialization.
 *
 * The mounted <CanonicalEditor> once crashed with
 * `node.type.spec.toDOM is not a function` because a custom node lacked
 * `renderHTML` (Tiptap derives the ProseMirror `toDOM` from it). The
 * component tests mock `@tiptap/react`, so the real EditorView / DOMSerializer
 * never ran and the gap shipped green. These tests exercise the real schema's
 * DOM (de)serialization without mocking Tiptap.
 */
describe("canonical ProseMirror schema — real DOM (de)serialization", () => {
  // Custom nodes that MUST define toDOM (the ones that were missing it).
  // `doc`/`text` are handled internally by ProseMirror and have no toDOM.
  const CUSTOM_NODES = [
    "inlineMath",
    "blockMath",
    "image",
    "scaffolding",
    "divider",
    "question",
  ];

  it("builds the DOM serializer and every custom node defines toDOM", () => {
    const schema = getEditorSchema();
    // The exact operation that crashed the real editor.
    expect(() => DOMSerializer.fromSchema(schema)).not.toThrow();
    for (const name of CUSTOM_NODES) {
      expect(typeof schema.nodes[name].spec.toDOM).toBe("function");
    }
  });

  it("serializes a full canonical document (every node type) to DOM without throwing", () => {
    const schema = getEditorSchema();
    const json = canonicalToProseMirror(richDocument) as unknown as Parameters<
      typeof schema.nodeFromJSON
    >[0];
    const doc = schema.nodeFromJSON(json);
    const serializer = DOMSerializer.fromSchema(schema);
    const container = document.createElement("div");
    expect(() => {
      container.appendChild(serializer.serializeFragment(doc.content));
    }).not.toThrow();
    // Custom-node markers from renderHTML are present.
    expect(container.querySelector("[data-type='question']")).toBeTruthy();
    expect(container.querySelector("[data-type='block-math']")).toBeTruthy();
    expect(container.querySelector("[data-type='inline-math']")).toBeTruthy();
    expect(container.querySelector("[data-type='scaffolding']")).toBeTruthy();
    expect(container.querySelector("[data-type='canonical-image']")).toBeTruthy();
    expect(container.querySelector("[data-type='divider']")).toBeTruthy();
  });

  it("parses HTML containing each custom node tag without throwing (parseHTML rules)", () => {
    const schema = getEditorSchema();
    const el = document.createElement("div");
    el.innerHTML = [
      "<p><span data-type=\"inline-math\">x^2</span></p>",
      "<div data-type=\"block-math\">y=mx+b</div>",
      "<img data-type=\"canonical-image\" src=\"https://example.com/a.png\" alt=\"fig\">",
      "<div data-type=\"scaffolding\"></div>",
      "<hr data-type=\"divider\">",
      "<div data-type=\"question\"><p>enunciado</p></div>",
    ].join("");
    const parser = PMDOMParser.fromSchema(schema);
    expect(() => parser.parse(el)).not.toThrow();
  });
});

/**
 * C-33: Tiptap turns a numeric-looking HTML attribute into a Number on parse, so a
 * formula "10" came back as 10 and the canonical schema (latex: string) rejected it.
 */
describe("math nodes keep `latex` a string through HTML round-trips (C-33)", () => {
  const schema = getEditorSchema();
  const parse = (html: string) => {
    const el = document.createElement("div");
    el.innerHTML = html;
    return PMDOMParser.fromSchema(schema).parse(el);
  };

  it.each(["10", "0.5", "-3", "1e3", ""])("inline formula %j", (latex) => {
    const doc = parse(`<p>a <span data-type="inline-math" latex="${latex}">${latex}</span> b</p>`);
    let found: unknown = undefined;
    doc.descendants((node) => {
      if (node.type.name === "inlineMath") found = node.attrs.latex;
    });
    expect(found).toBe(latex);
  });

  it.each(["10", "7"])("block formula %j", (latex) => {
    const doc = parse(`<div data-type="block-math" latex="${latex}">${latex}</div>`);
    let found: unknown = undefined;
    doc.descendants((node) => {
      if (node.type.name === "blockMath") found = node.attrs.latex;
    });
    expect(found).toBe(latex);
  });

  it("falls back to the text content when the attribute is absent", () => {
    const doc = parse(`<p><span data-type="inline-math">x^2</span></p>`);
    let found: unknown;
    doc.descendants((node) => {
      if (node.type.name === "inlineMath") found = node.attrs.latex;
    });
    expect(found).toBe("x^2");
  });
});
