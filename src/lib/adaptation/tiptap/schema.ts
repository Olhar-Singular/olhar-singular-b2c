/**
 * Tiptap / ProseMirror node + mark definitions for the canonical Adaptar model.
 *
 * The canonical Zod model (see ../canonical/schema.ts) is the SOURCE OF TRUTH;
 * this ProseMirror schema is the *editing representation*. The mapping between
 * the two (toCanonical.ts / fromCanonical.ts) is provably lossless via the
 * round-trip tests.
 *
 * Design notes:
 *  - Every block node carries `id` and `style` attrs (mirrors BlockBase).
 *  - `blockMath`, `image`, `inlineMath` are atoms holding their data in attrs.
 *  - `scaffolding` stores its `items` (string[]) as a JSON attr.
 *  - `question` stores its rich interaction (`answer`) plus `instruction` as
 *    attrs; its `stem` is child block content. It carries no number/points/
 *    difficulty — the displayed number is derived from document order.
 *    Storing the structured `answer` (alternatives, gaps, pairs, …) as a JSON
 *    attr is what guarantees a lossless round-trip — no construct is flattened
 *    into text.
 */

import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { Node, Mark, mergeAttributes } from "@tiptap/core";
import { FontSize } from "@/lib/tiptap/fontSizeExtension";

// ---------------------------------------------------------------------------
// Shared attribute helpers
// ---------------------------------------------------------------------------

/**
 * `id` + `style` attributes shared by every block node (mirrors BlockBase).
 * `style` is an object held in the model only — `rendered: false` keeps it out
 * of HTML serialization (it would otherwise stringify to "[object Object]").
 * The canonical round-trip is JSON-based (toJSON), so this does not affect it.
 */
const blockBaseAttributes = {
  id: { default: null as string | null },
  style: { default: null as Record<string, unknown> | null, rendered: false },
};

// ---------------------------------------------------------------------------
// Inline atom: inlineMath
// ---------------------------------------------------------------------------

export const InlineMathNode = Node.create({
  name: "inlineMath",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      latex: { default: "" },
      alt: { default: null as string | null },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-type='inline-math']" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    // `latex` always defaults to "" (never null), so no nullish branch here.
    return [
      "span",
      mergeAttributes(HTMLAttributes, { "data-type": "inline-math" }),
      String(node.attrs.latex),
    ];
  },
});

// ---------------------------------------------------------------------------
// Block atom: blockMath
// ---------------------------------------------------------------------------

export const BlockMathNode = Node.create({
  name: "blockMath",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      ...blockBaseAttributes,
      latex: { default: "" },
      alt: { default: null as string | null },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-type='block-math']" }];
  },
  renderHTML({ HTMLAttributes, node }) {
    // `latex` always defaults to "" (never null), so no nullish branch here.
    return [
      "div",
      mergeAttributes(HTMLAttributes, { "data-type": "block-math" }),
      String(node.attrs.latex),
    ];
  },
});

// ---------------------------------------------------------------------------
// Block atom: image
// ---------------------------------------------------------------------------

export const ImageBlockNode = Node.create({
  name: "image",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      ...blockBaseAttributes,
      src: { default: "" },
      alt: { default: "" },
      width: { default: null as number | null },
      alignment: { default: null as string | null },
      // RichText (array) stored as JSON attr to stay lossless; model-only.
      caption: { default: null as unknown, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: "img[data-type='canonical-image']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["img", mergeAttributes(HTMLAttributes, { "data-type": "canonical-image" })];
  },
});

// ---------------------------------------------------------------------------
// Block: scaffolding (items: string[] stored as JSON attr)
// ---------------------------------------------------------------------------

export const ScaffoldingNode = Node.create({
  name: "scaffolding",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      ...blockBaseAttributes,
      // string[] held in the model only.
      items: { default: [] as string[], rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-type='scaffolding']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "scaffolding" })];
  },
});

// ---------------------------------------------------------------------------
// Block: divider
// ---------------------------------------------------------------------------

export const DividerNode = Node.create({
  name: "divider",
  group: "block",
  atom: true,
  selectable: true,
  addAttributes() {
    return { ...blockBaseAttributes };
  },
  parseHTML() {
    return [{ tag: "hr[data-type='divider']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["hr", mergeAttributes(HTMLAttributes, { "data-type": "divider" })];
  },
});

// ---------------------------------------------------------------------------
// Block: question (stem = child block content; rest in attrs)
// ---------------------------------------------------------------------------

export const QuestionNode = Node.create({
  name: "question",
  group: "block",
  // Its stem is a sequence of block nodes (recursive).
  content: "block+",
  defining: true,
  selectable: true,
  addAttributes() {
    return {
      ...blockBaseAttributes,
      // RichText stored as JSON attr; model-only.
      instruction: { default: null as unknown, rendered: false },
      // Optional rich-text question statement with position relative to stem.
      enunciado: { default: null as unknown, rendered: false },
      enunciadoPosition: { default: null as string | null },
      // QuestionAnswer (discriminated union) stored as JSON attr — this is
      // what keeps deep structures (alternatives, gaps, pairs, …) lossless.
      // Model-only (an object); never serialized to HTML attributes.
      answer: { default: null as unknown, rendered: false },
    };
  },
  parseHTML() {
    return [{ tag: "div[data-type='question']" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["div", mergeAttributes(HTMLAttributes, { "data-type": "question" }), 0];
  },
});

// ---------------------------------------------------------------------------
// Heading / paragraph id+style: add the block-base attrs onto StarterKit nodes
// via a global-attributes extension.
// ---------------------------------------------------------------------------

export const BlockIdStyle = Mark.create({
  // A no-op mark used only as a host for addGlobalAttributes. (Marks can carry
  // global attributes the same way extensions can.) It is never applied.
  name: "blockIdStyle",
  addGlobalAttributes() {
    return [
      {
        types: ["heading", "paragraph"],
        attributes: {
          id: { default: null as string | null },
          style: { default: null as Record<string, unknown> | null, rendered: false },
        },
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Aggregated extension list
// ---------------------------------------------------------------------------

/**
 * Build the full extension list for the canonical ProseMirror schema.
 * Reused by getEditorSchema.ts (tests + future editor).
 */
export function buildCanonicalExtensions() {
  return [
    // StarterKit ships many nodes/marks the canonical model can't represent.
    // We keep ONLY what the canonical schema maps losslessly — doc, paragraph,
    // heading (levels 1-3), text, hardBreak, the bold/italic/strike marks, plus
    // the history/dropcursor/gapcursor editing plugins — and disable everything
    // else. Otherwise those nodes/marks are live but unmapped: `pmToBlock`
    // throws on a stray list/blockquote/codeBlock/horizontalRule, and the
    // inline `code` mark is silently dropped on round-trip. Disabling them makes
    // a paste/insert of an unsupported construct DEGRADE to plain paragraph text
    // (ProseMirror drops schema-absent nodes) instead of crashing or losing data.
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      code: false,
    }),
    Underline,
    TextStyle,
    Color,
    FontSize,
    InlineMathNode,
    BlockMathNode,
    ImageBlockNode,
    ScaffoldingNode,
    DividerNode,
    QuestionNode,
    BlockIdStyle,
  ];
}
