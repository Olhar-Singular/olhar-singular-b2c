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
import { Node, Mark, Extension, mergeAttributes } from "@tiptap/core";
import { FontSize } from "@/lib/tiptap/fontSizeExtension";
import { normalizeColor } from "../canonical/colors";

// ---------------------------------------------------------------------------
// Shared attribute helpers
// ---------------------------------------------------------------------------

/**
 * An attribute whose value is an object or array living in the MODEL
 * (`style`, `answer`, `instruction`, `enunciado`, `caption`, `items`).
 *
 * These used to be declared `rendered: false` — kept out of HTML because an
 * object stringifies to "[object Object]". The canonical round-trip is
 * JSON-based, so that looked free. It was not: **ProseMirror's clipboard
 * round-trips through HTML**. `serializeForClipboard` writes HTML (the
 * `data-pm-slice` attribute only records slice depth, not node JSON) and the
 * paste re-parses it, so "not rendered" really meant "destroyed by copy/paste".
 * A pasted question came back with `answer: null`, which the canonical model
 * cannot represent — so the whole document stopped round-tripping, the autosave
 * silently froze, and QuestionNodeView crashed reading `answer.kind`.
 *
 * Encoding the value as JSON in a `data-*` attribute makes copy/paste lossless.
 * A malformed value (hand-edited HTML, a paste from a foreign app) falls back to
 * the default instead of throwing inside ProseMirror's parser.
 */
function jsonAttribute<T>(name: string, defaultValue: T) {
  const dataName = `data-${name.toLowerCase()}`;
  return {
    default: defaultValue,
    parseHTML: (element: HTMLElement): T => {
      const raw = element.getAttribute(dataName);
      if (raw === null) return defaultValue;
      try {
        return JSON.parse(raw) as T;
      } catch {
        return defaultValue;
      }
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[name];
      if (value === undefined || value === null) return {};
      return { [dataName]: JSON.stringify(value) };
    },
  };
}

/**
 * A numeric attribute. HTML attributes are strings, so a plain `width` came
 * back from a paste as `"320"` and failed the canonical `z.number()` exactly
 * like the missing `answer` did — same freeze, quieter cause.
 */
function numberAttribute(name: string) {
  return {
    default: null as number | null,
    parseHTML: (element: HTMLElement): number | null => {
      const raw = element.getAttribute(name);
      if (raw === null) return null;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    },
    renderHTML: (attributes: Record<string, unknown>) => {
      const value = attributes[name];
      if (value === undefined || value === null) return {};
      return { [name]: String(value) };
    },
  };
}

/**
 * `id` + `style` attributes shared by every block node (mirrors BlockBase).
 */
const blockBaseAttributes = {
  id: { default: null as string | null },
  style: jsonAttribute<Record<string, unknown> | null>("style", null),
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
      width: numberAttribute("width"),
      alignment: { default: null as string | null },
      // RichText (array) stored as JSON attr to stay lossless.
      caption: jsonAttribute<unknown>("caption", null),
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
      items: jsonAttribute<string[]>("items", []),
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
      // RichText stored as JSON attr.
      instruction: jsonAttribute<unknown>("instruction", null),
      // Optional rich-text question statement with position relative to stem.
      enunciado: jsonAttribute<unknown>("enunciado", null),
      enunciadoPosition: { default: null as string | null },
      // Optional override of the auto-computed question ordinal (e.g. "1a", "B2").
      customNumber: { default: null as string | null },
      // QuestionAnswer (discriminated union) stored as JSON attr — this is
      // what keeps deep structures (alternatives, gaps, pairs, …) lossless.
      answer: jsonAttribute<unknown>("answer", null),
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
          style: jsonAttribute<Record<string, unknown> | null>("style", null),
        },
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Color, clamped to the canonical allowlist
// ---------------------------------------------------------------------------

/**
 * `@tiptap/extension-color` accepts ANY CSS color, but the canonical model only
 * accepts the palette (see canonical/colors.ts). Every color entering the
 * editor through the DOM is therefore coerced to the nearest allowed value on
 * parse — both a foreign paste (Word/Docs) and our own clipboard, which
 * serializes `#DC2626` as `rgb(220, 38, 38)`. Without this the document failed
 * canonical validation on every keystroke and the autosave silently froze.
 */
export const AllowlistedColor = Color.extend({
  addGlobalAttributes() {
    return [
      {
        types: ["textStyle"],
        attributes: {
          color: {
            default: null as string | null,
            parseHTML: (element: HTMLElement) => normalizeColor(element.style.color),
            renderHTML: (attributes: Record<string, unknown>) =>
              attributes.color ? { style: `color: ${attributes.color as string}` } : {},
          },
        },
      },
    ];
  },
});

// ---------------------------------------------------------------------------
// Shift+Enter → new paragraph (hardBreak replacement)
// ---------------------------------------------------------------------------

/**
 * Binds Shift+Enter / Mod+Enter to `splitBlock` (a new paragraph).
 *
 * StarterKit's `hardBreak` is disabled (see `buildCanonicalExtensions`): the
 * canonical model has no inline-break node, and `pmToInline` mapped a stray
 * hardBreak to an EMPTY text run — which used to validate, so the autosave
 * persisted it, and then `Node.fromJSON` refused to reload it ("Empty text
 * nodes are not allowed") and the adaptation reopened as a blank sheet.
 *
 * Removing `hardBreak` alone would leave Shift+Enter a silent no-op (nothing in
 * ProseMirror's base keymap binds it), so we degrade it to the nearest
 * representable construct — the same treatment lists/blockquote already get.
 * The user still gets a visible line break, and it round-trips. The new
 * paragraph inherits the split block's attrs, including `id`; `UniqueId`
 * reassigns the duplicate on the same transaction.
 */
export const BreakAsParagraph = Extension.create({
  name: "breakAsParagraph",
  addKeyboardShortcuts() {
    const split = () => this.editor.commands.splitBlock();
    return { "Shift-Enter": split, "Mod-Enter": split };
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
    // heading (levels 1-3), text, the bold/italic/strike marks, plus the
    // history/dropcursor/gapcursor editing plugins — and disable everything
    // else. Otherwise those nodes/marks are live but unmapped: `pmToBlock`
    // throws on a stray list/blockquote/codeBlock/horizontalRule, and the
    // inline `code` mark is silently dropped on round-trip. Disabling them makes
    // a paste/insert of an unsupported construct DEGRADE to plain paragraph text
    // (ProseMirror drops schema-absent nodes) instead of crashing or losing data.
    //
    // `hardBreak` is disabled for a nastier reason: it was live but unmapped on
    // the INLINE side, where `pmToInline` has no `throw` to fall back on — a
    // Shift+Enter silently became an empty text run, which validated, got
    // autosaved, and then could not be reloaded. Shift+Enter is rebound to a
    // paragraph split by `BreakAsParagraph` below.
    StarterKit.configure({
      heading: { levels: [1, 2, 3] },
      bulletList: false,
      orderedList: false,
      listItem: false,
      blockquote: false,
      codeBlock: false,
      horizontalRule: false,
      hardBreak: false,
      code: false,
    }),
    Underline,
    TextStyle,
    AllowlistedColor,
    FontSize,
    InlineMathNode,
    BlockMathNode,
    ImageBlockNode,
    ScaffoldingNode,
    DividerNode,
    QuestionNode,
    BlockIdStyle,
    BreakAsParagraph,
  ];
}
