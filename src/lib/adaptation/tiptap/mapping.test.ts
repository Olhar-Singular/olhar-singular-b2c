import { describe, it, expect } from "vitest";
import { Node as PMNode, DOMParser as DOMParser2 } from "@tiptap/pm/model";
import { getEditorSchema } from "./getEditorSchema";
import { canonicalToProseMirror } from "./fromCanonical";
import { proseMirrorToCanonical, tryProseMirrorToCanonical } from "./toCanonical";
import { richDocument } from "./__fixtures__/richDocument";
import { validateDocument } from "@/lib/adaptation/canonical/validate";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";

const schema = getEditorSchema();

/** Round-trip a canonical doc through the real ProseMirror schema. */
function pmRoundTrip(doc: CanonicalDocument) {
  const pmJSON = canonicalToProseMirror(doc);
  // Load into the real schema (fills defaults / validates structure) then
  // serialize back exactly as the editor would.
  const node = PMNode.fromJSON(schema, pmJSON);
  return node.toJSON();
}

const uid = (n: number): string =>
  `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

describe("canonical <-> ProseMirror mapping", () => {
  describe("lossless round-trip (canonical -> PM -> canonical)", () => {
    it("deep-equals the original rich document", () => {
      const back = proseMirrorToCanonical(pmRoundTrip(richDocument));
      expect(back).toEqual(richDocument);
    });

    it("preserves deep question structures (alternatives, gaps)", () => {
      const back = proseMirrorToCanonical(pmRoundTrip(richDocument));
      const q = back.blocks.find((b) => b.id === uid(7));
      expect(q).toEqual(richDocument.blocks.find((b) => b.id === uid(7)));
    });
  });

  describe("PM -> canonical -> PM stability", () => {
    it("is stable for an editor-produced doc", () => {
      // Produce a doc the way the editor would: load then serialize.
      const editorDoc = pmRoundTrip(richDocument);
      const canonical = proseMirrorToCanonical(editorDoc);
      const again = pmRoundTrip(canonical);
      expect(again).toEqual(editorDoc);
    });
  });

  describe("proseMirrorToCanonical output validity", () => {
    it("always passes validateDocument", () => {
      const out = proseMirrorToCanonical(pmRoundTrip(richDocument));
      expect(() => validateDocument(out)).not.toThrow();
    });
  });

  describe("inline mapping fidelity", () => {
    it("round-trips text marks (bold/italic/underline/strike) and color", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          {
            id: uid(100),
            type: "paragraph",
            content: [
              { type: "text", text: "a", marks: ["bold"] },
              { type: "text", text: "b", marks: ["italic", "underline", "strike"] },
              { type: "text", text: "c", color: "#2563EB" },
              { type: "text", text: "d", marks: ["bold"], color: "#16A34A" },
            ],
          },
        ],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("round-trips inlineMath with and without alt", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          {
            id: uid(101),
            type: "paragraph",
            content: [
              { type: "inlineMath", latex: "a+b" },
              { type: "text", text: " x " },
              { type: "inlineMath", latex: "c+d", alt: "c plus d" },
            ],
          },
        ],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("normalizes mark order regardless of source ordering", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          {
            id: uid(102),
            type: "paragraph",
            content: [{ type: "text", text: "z", marks: ["strike", "bold"] }],
          },
        ],
      };
      const back = proseMirrorToCanonical(pmRoundTrip(doc));
      const para = back.blocks[0];
      // Output order is canonical (bold before strike), still deep-equal-safe
      // because the schema only checks set membership.
      expect(para).toMatchObject({
        content: [{ type: "text", text: "z", marks: ["bold", "strike"] }],
      });
    });
  });

  describe("textStyle marks carrying no color", () => {
    // The editor (with FontFamily/FontSize) can emit a `textStyle` mark that
    // carries no `color`. proseMirrorToCanonical must simply drop it — the run
    // becomes a plain text run with no color. We feed schema-valid PM JSON
    // directly (the function accepts editor-produced JSON).
    it("drops a textStyle mark with null color and one with no attrs", () => {
      const pm = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: uid(120), style: null },
            content: [
              {
                type: "text",
                text: "a",
                marks: [{ type: "textStyle", attrs: { color: null } }],
              },
              {
                type: "text",
                text: "b",
                // An unrelated mark (e.g. highlight) the canonical model does
                // not represent must be dropped, not crash the mapping.
                marks: [{ type: "textStyle" }, { type: "highlight" }],
              },
            ],
          },
        ],
      };
      const out = proseMirrorToCanonical(pm);
      expect(out.blocks[0]).toEqual({
        id: uid(120),
        type: "paragraph",
        content: [
          { type: "text", text: "a" },
          { type: "text", text: "b" },
        ],
      });
    });
  });

  describe("edge cases", () => {
    it("handles an empty paragraph", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [{ id: uid(103), type: "paragraph", content: [] }],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("handles image without optional fields", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [{ id: uid(104), type: "image", src: "https://example.com/s.png", alt: "" }],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("handles a question with a minimal stem and open answer", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          {
            id: uid(105),
            type: "question",
            stem: [{ id: uid(106), type: "paragraph", content: [] }],
            answer: { kind: "open" },
          },
        ],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("round-trips per-node style", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          {
            id: uid(107),
            type: "divider",
            style: { pageBreakBefore: true, spacingAfter: 12 },
          },
        ],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("round-trips heading levels 2 and 3", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          { id: uid(108), type: "heading", level: 2, content: [{ type: "text", text: "h2" }] },
          { id: uid(109), type: "heading", level: 3, content: [{ type: "text", text: "h3" }] },
        ],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("round-trips blockMath without alt", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [{ id: uid(110), type: "blockMath", latex: "x=1" }],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });

    it("round-trips question with enunciado and enunciadoPosition", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          {
            id: uid(111),
            type: "question",
            stem: [{ id: uid(112), type: "paragraph", content: [{ type: "text", text: "Obs." }] }],
            enunciado: [
              { type: "text", text: "Texto ", marks: ["bold"] as ["bold"] },
              { type: "text", text: "do enunciado", color: "#DC2626" },
            ],
            enunciadoPosition: "above",
            answer: { kind: "open" },
          },
        ],
      };
      expect(proseMirrorToCanonical(pmRoundTrip(doc))).toEqual(doc);
    });
  });

  describe("StarterKit hardening (only canonical-mappable nodes/marks live)", () => {
    it("does not register nodes/marks the canonical model can't represent", () => {
      // Disabled StarterKit nodes/marks.
      for (const name of ["bulletList", "orderedList", "listItem", "blockquote", "codeBlock", "horizontalRule"]) {
        expect(schema.nodes[name]).toBeUndefined();
      }
      expect(schema.marks.code).toBeUndefined();
      // Kept nodes/marks.
      expect(schema.nodes.paragraph).toBeDefined();
      expect(schema.nodes.heading).toBeDefined();
      expect(schema.marks.bold).toBeDefined();
      expect(schema.marks.italic).toBeDefined();
      expect(schema.marks.strike).toBeDefined();
    });

    it("degrades a pasted list to plain paragraph text (no schema-absent nodes)", () => {
      const dom = new DOMParser().parseFromString(
        "<ul><li>one</li><li>two</li></ul>",
        "text/html",
      );
      const node = DOMParser2.fromSchema(schema).parse(dom.body);
      const json = node.toJSON();
      // No list/listItem nodes survive — they degrade to paragraphs.
      const types = new Set<string>();
      const walk = (n: { type: string; content?: { type: string }[] }) => {
        types.add(n.type);
        (n.content as typeof json.content)?.forEach(walk);
      };
      walk(json);
      expect(types.has("bulletList")).toBe(false);
      expect(types.has("listItem")).toBe(false);
      // The round-trip no longer throws on the degraded doc.
      expect(() => tryProseMirrorToCanonical(json)).not.toThrow();
    });

    it("degrades inline `code` to plain text (mark dropped, text preserved)", () => {
      const dom = new DOMParser().parseFromString(
        "<p>a <code>b</code> c</p>",
        "text/html",
      );
      const json = DOMParser2.fromSchema(schema).parse(dom.body).toJSON() as {
        content: { content?: { text?: string; marks?: { type: string }[] }[] }[];
      };
      const runs = json.content[0].content ?? [];
      // The text content survives intact (no silent loss)...
      expect(runs.map((r) => r.text ?? "").join("")).toBe("a b c");
      // ...and no `code` mark survived (the mark is absent from the schema).
      for (const run of runs) {
        expect((run.marks ?? []).some((m) => m.type === "code")).toBe(false);
      }
    });
  });

  describe("tryProseMirrorToCanonical (non-throwing)", () => {
    it("returns ok with the validated doc for a valid PM JSON", () => {
      const valid = canonicalToProseMirror(richDocument);
      const result = tryProseMirrorToCanonical(valid);
      expect(result.ok).toBe(true);
      if (result.ok) expect(result.value).toEqual(richDocument);
    });

    it("returns ok:false for a transient-invalid doc (empty image src) without throwing", () => {
      const invalid = {
        type: "doc",
        content: [{ type: "image", attrs: { id: uid(200), src: "", alt: "" } }],
      };
      expect(() => tryProseMirrorToCanonical(invalid)).not.toThrow();
      expect(tryProseMirrorToCanonical(invalid).ok).toBe(false);
    });

    it("returns ok:false for an empty document (all blocks deleted)", () => {
      expect(tryProseMirrorToCanonical({ type: "doc", content: [] }).ok).toBe(false);
    });

    it("returns ok:false (no throw) when the doc has no content array at all", () => {
      expect(() => tryProseMirrorToCanonical({ type: "doc" })).not.toThrow();
      expect(tryProseMirrorToCanonical({ type: "doc" }).ok).toBe(false);
    });

    it("returns ok:false (instead of throwing) on an unmappable node type", () => {
      const unmappable = {
        type: "doc",
        content: [{ type: "bulletList", content: [] }],
      };
      expect(() => tryProseMirrorToCanonical(unmappable)).not.toThrow();
      expect(tryProseMirrorToCanonical(unmappable).ok).toBe(false);
    });
  });
});
