import { describe, it, expect } from "vitest";
import { Editor } from "@tiptap/core";
import { Node as PMNode, DOMParser as DOMParser2, DOMSerializer } from "@tiptap/pm/model";
import { getEditorSchema, buildExtensions } from "./getEditorSchema";
import { canonicalToProseMirror, type PMNode as PMNodeJSON } from "./fromCanonical";
import { proseMirrorToCanonical, tryProseMirrorToCanonical } from "./toCanonical";
import { richDocument } from "./__fixtures__/richDocument";
import { UniqueId } from "./uniqueId";
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

/** A minimal one-paragraph document to type/paste into. */
const oneParagraph: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [
    { id: uid(300), type: "paragraph", content: [{ type: "text", text: "linha um" }] },
  ],
};

/**
 * Drive the REAL editor (canonical extensions + UniqueId, no React NodeViews)
 * over `oneParagraph` and return the resulting PM JSON. This is the only way to
 * exercise paste and keymaps the way the browser does — the mapper alone can't.
 */
function withEditor(act: (editor: Editor) => void): PMNodeJSON {
  const editor = new Editor({
    extensions: [...buildExtensions(), UniqueId],
    content: canonicalToProseMirror(oneParagraph) as never,
  });
  try {
    editor.commands.focus("end");
    act(editor);
    return editor.getJSON() as PMNodeJSON;
  } finally {
    editor.destroy();
  }
}

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

    it("round-trips question with customNumber override", () => {
      const doc: CanonicalDocument = {
        schemaVersion: 1,
        blocks: [
          {
            id: uid(113),
            type: "question",
            stem: [{ id: uid(114), type: "paragraph", content: [{ type: "text", text: "Q." }] }],
            customNumber: "1a",
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

  // -------------------------------------------------------------------------
  // B8 · gatilho G1 — Shift+Enter (hardBreak)
  // -------------------------------------------------------------------------
  //
  // hardBreak used to survive in StarterKit while `pmToInline` had no branch for
  // it, so a Shift+Enter degraded into `{ type: "text", text: "" }`. That run
  // VALIDATED (InlineText.text had no `.min(1)`), so the autosave happily
  // persisted it — and then `Node.fromJSON` refused to reload it ("Empty text
  // nodes are not allowed"), so reopening the adaptation showed a blank sheet.
  //
  // Two guards, at two levels:
  //  1. the editor never produces an inline break (hardBreak is out of the
  //     schema; Shift+Enter splits into a representable paragraph);
  //  2. the canonical schema itself rejects the empty run, so ANY future path
  //     that produces one fails the round-trip loudly instead of persisting a
  //     document that cannot be reopened.
  describe("Shift+Enter never freezes the round-trip (B8 · G1)", () => {
    it("exposes no hardBreak node — the canonical model cannot represent an inline break", () => {
      expect(schema.nodes.hardBreak).toBeUndefined();
    });

    it("maps Shift+Enter to a NEW PARAGRAPH whose document still round-trips AND reloads", () => {
      const json = withEditor((editor) => {
        editor.commands.keyboardShortcut("Shift-Enter");
      });

      const result = tryProseMirrorToCanonical(json);
      // The autosave must keep capturing — this is the freeze itself.
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The break became a second, representable paragraph with a fresh id.
      expect(result.value.blocks).toHaveLength(2);
      expect(result.value.blocks.every((b) => b.type === "paragraph")).toBe(true);
      expect(result.value.blocks[0].id).not.toBe(result.value.blocks[1].id);

      // And the persisted document REOPENS — the half that used to blow up.
      expect(() =>
        PMNode.fromJSON(schema, canonicalToProseMirror(result.value)),
      ).not.toThrow();
    });

    it("rejects an empty text run: what cannot be reloaded must not validate", () => {
      const withEmptyRun = {
        type: "doc",
        content: [
          {
            type: "paragraph",
            attrs: { id: uid(301) },
            content: [
              { type: "text", text: "linha um" },
              // exactly what a stray hardBreak used to map to
              { type: "text", text: "" },
              { type: "text", text: "linha dois" },
            ],
          },
        ],
      };

      // Proof this state is genuinely unreloadable — accepting it is a trap.
      expect(() => PMNode.fromJSON(schema, withEmptyRun)).toThrow();
      expect(tryProseMirrorToCanonical(withEmptyRun).ok).toBe(false);
    });
  });

  // -------------------------------------------------------------------------
  // B8 · gatilho G2 — copiar/colar (Ctrl+C / Ctrl+V)
  // -------------------------------------------------------------------------
  //
  // ProseMirror's clipboard does NOT carry node JSON: `serializeForClipboard`
  // writes HTML (the `data-pm-slice` attribute only records slice depth), and
  // the paste re-PARSES that HTML. So every attr declared `rendered: false`
  // — `answer`, `instruction`, `enunciado`, `style`, `items`, `caption` — was
  // simply gone on the way back, and a pasted question came back with
  // `answer: null`. That is unrepresentable in the canonical model, so the
  // round-trip failed on EVERY keystroke for as long as the pasted copy existed
  // (and QuestionNodeView crashed reading `answer.kind`).
  //
  // Sub-case: attrs that ARE rendered come back as HTML strings, so the image's
  // numeric `width` returned as "320" and failed `z.number()` the same way.
  describe("copiar/colar não congela o round-trip (B8 · G2)", () => {
    /**
     * Exactly what the clipboard does: serialize the slice to DOM, then parse
     * that DOM back. Anything lost here is lost on a real Ctrl+C / Ctrl+V.
     */
    function clipboardRoundTrip(doc: CanonicalDocument): PMNodeJSON {
      const node = PMNode.fromJSON(schema, canonicalToProseMirror(doc));
      const container = document.createElement("div");
      container.appendChild(
        DOMSerializer.fromSchema(schema).serializeFragment(node.content),
      );
      return DOMParser2.fromSchema(schema).parse(container).toJSON() as PMNodeJSON;
    }

    it("a pasted document still maps to canonical (no permanent freeze)", () => {
      const result = tryProseMirrorToCanonical(clipboardRoundTrip(richDocument));
      expect(result.ok).toBe(true);
    });

    it("keeps a pasted question's answer, instruction and enunciado", () => {
      const result = tryProseMirrorToCanonical(clipboardRoundTrip(richDocument));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const original = richDocument.blocks.find((b) => b.id === uid(7));
      const pasted = result.value.blocks.find((b) => b.id === uid(7));
      expect(pasted).toEqual(original);
    });

    it("keeps a pasted image's width NUMERIC (HTML attrs come back as strings)", () => {
      const result = tryProseMirrorToCanonical(clipboardRoundTrip(richDocument));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      const pasted = result.value.blocks.find((b) => b.id === uid(4));
      expect(pasted).toEqual(richDocument.blocks.find((b) => b.id === uid(4)));
    });

    it("keeps a pasted scaffolding's items and a block's per-node style", () => {
      const result = tryProseMirrorToCanonical(clipboardRoundTrip(richDocument));
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // items: string[] held as a model-only attr.
      expect(result.value.blocks.find((b) => b.id === uid(5))).toEqual(
        richDocument.blocks.find((b) => b.id === uid(5)),
      );
      // style: object attr on an ordinary heading (BlockIdStyle globals).
      expect(result.value.blocks.find((b) => b.id === uid(1))).toEqual(
        richDocument.blocks.find((b) => b.id === uid(1)),
      );
    });

    /**
     * The JSON now travels through the clipboard, so it can arrive corrupted —
     * a truncated copy, HTML mangled by an intermediate app, a hand-edited
     * page. Parsing must degrade, never throw: an exception inside ProseMirror's
     * DOM parser takes down the whole editor, which is worse than the freeze
     * this fix was meant to remove.
     */
    it("degrades instead of throwing when a model-only attr is not valid JSON", () => {
      const el = document.createElement("div");
      el.innerHTML =
        '<div data-type="question" data-answer="{nao-e-json" data-style="[[">' +
        "<p>pergunta</p></div>";

      const parsed = () =>
        DOMParser2.fromSchema(schema).parse(el).toJSON() as PMNodeJSON;
      expect(parsed).not.toThrow();

      // It falls back to the default (null answer), which the canonical model
      // rejects — reported as a capture failure, not as a crash.
      const result = tryProseMirrorToCanonical(parsed());
      expect(result.ok).toBe(false);
      expect(result.reason).toBeTruthy();
    });

    it("ignores a non-numeric width instead of carrying a NaN into the model", () => {
      const el = document.createElement("div");
      el.innerHTML =
        '<img data-type="canonical-image" src="https://example.com/a.png" ' +
        'alt="fig" width="muito-grande">';

      const parsed = DOMParser2.fromSchema(schema).parse(el).toJSON() as PMNodeJSON;
      const image = (parsed.content as PMNodeJSON[])[0];
      expect(image.attrs?.width).toBeNull();
    });
  });

  // -------------------------------------------------------------------------
  // B8 · gatilho G3 — colar de fonte externa (Word / Google Docs)
  // -------------------------------------------------------------------------
  //
  // `@tiptap/extension-color` accepts any CSS color, but the canonical model
  // only accepts the palette — so a paste carrying `color: #ff0000` produced a
  // document that failed validation on EVERY keystroke, freezing the autosave
  // for as long as the pasted text survived. The quieter sibling: FontSize
  // returned the raw declaration, and `toCanonical` reads it as pixels, so a
  // pasted `12pt` silently became 9pt on the sheet and in the PDF.
  describe("colar de fonte externa não congela o round-trip (B8 · G3)", () => {
    /** Find the first text run carrying color/fontSize in a canonical doc. */
    function styledRun(doc: CanonicalDocument) {
      for (const block of doc.blocks) {
        if (block.type !== "paragraph" && block.type !== "heading") continue;
        const run = block.content.find(
          (i) => i.type === "text" && (i.color !== undefined || i.fontSize !== undefined),
        );
        if (run !== undefined) return run as Extract<typeof run, { type: "text" }>;
      }
      return undefined;
    }

    it("clamps a foreign color into the palette instead of freezing the autosave", () => {
      const json = withEditor((editor) => {
        editor.commands.insertContent(
          '<p><span style="color: #ff0000">urgente</span></p>',
        );
      });

      const result = tryProseMirrorToCanonical(json);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // The emphasis survives, mapped onto the palette's red.
      expect(styledRun(result.value)?.color).toBe("#DC2626");
    });

    it("normalizes a pasted pt font-size instead of silently shrinking it", () => {
      const json = withEditor((editor) => {
        editor.commands.insertContent(
          '<p><span style="font-size: 12pt">enunciado</span></p>',
        );
      });

      const result = tryProseMirrorToCanonical(json);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      // 12pt must come back as 12pt — not as 9pt (12px read as pixels).
      expect(styledRun(result.value)?.fontSize).toBe(12);
    });

    it("drops a font-size in a unit it cannot convert rather than inventing one", () => {
      const json = withEditor((editor) => {
        editor.commands.insertContent('<p><span style="font-size: 1.5em">x</span></p>');
      });

      const result = tryProseMirrorToCanonical(json);
      expect(result.ok).toBe(true);
      if (!result.ok) return;

      expect(styledRun(result.value)).toBeUndefined();
    });
  });
});
