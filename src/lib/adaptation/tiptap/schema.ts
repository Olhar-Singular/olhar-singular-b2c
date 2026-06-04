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
 *  - `question` stores its rich interaction (`answer`) plus `number`, `points`,
 *    `difficulty` and `instruction` as attrs; its `stem` is child block content.
 *    Storing the structured `answer` (alternatives, gaps, pairs, …) as a JSON
 *    attr is what guarantees a lossless round-trip — no construct is flattened
 *    into text.
 */

import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { Node, Mark } from "@tiptap/core";

// ---------------------------------------------------------------------------
// Shared attribute helpers
// ---------------------------------------------------------------------------

/** `id` + `style` attributes shared by every block node (mirrors BlockBase). */
const blockBaseAttributes = {
  id: { default: null as string | null },
  style: { default: null as Record<string, unknown> | null },
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
      // RichText (array) stored as JSON attr to stay lossless.
      caption: { default: null as unknown },
    };
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
      items: { default: [] as string[] },
    };
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
      number: { default: null as number | null },
      points: { default: null as number | null },
      difficulty: { default: null as string | null },
      // RichText stored as JSON attr.
      instruction: { default: null as unknown },
      // QuestionAnswer (discriminated union) stored as JSON attr — this is
      // what keeps deep structures (alternatives, gaps, pairs, …) lossless.
      answer: { default: null as unknown },
    };
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
          style: { default: null as Record<string, unknown> | null },
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
    // StarterKit gives us doc, paragraph, heading, text, bold, italic, strike,
    // and more. We keep heading (levels 1-3) and disable nothing extra here.
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
    }),
    Underline,
    TextStyle,
    Color,
    InlineMathNode,
    BlockMathNode,
    ImageBlockNode,
    ScaffoldingNode,
    DividerNode,
    QuestionNode,
    BlockIdStyle,
  ];
}
