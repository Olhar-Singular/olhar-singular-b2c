/**
 * ProseMirror JSON -> canonical.
 *
 * Reconstructs a CanonicalDocument from a ProseMirror doc JSON object (either
 * the raw output of `canonicalToProseMirror` or the fully-defaulted output of
 * `Node.fromJSON(schema, json).toJSON()`), then validates it.
 *
 * Optional fields are omitted (not set to null/undefined) when the PM attr is
 * absent/null/default — this is what makes the round-trip deep-equal the
 * original canonical document.
 */

import type { PMMark, PMNode } from "./fromCanonical";
import { validateDocument } from "../canonical/validate";
import type {
  Block,
  CanonicalDocument,
  Inline,
  NodeStyle,
  RichText,
} from "../canonical/schema";

const TEXT_MARK_NAMES = new Set(["bold", "italic", "underline", "strike"]);
const MARK_ORDER = ["bold", "italic", "underline", "strike"] as const;

// ---------------------------------------------------------------------------
// Attr helpers
// ---------------------------------------------------------------------------

function attrs(node: PMNode): Record<string, unknown> {
  /* v8 ignore next -- defensive: schema-valid block/inline nodes always carry attrs */
  return node.attrs ?? {};
}

/** Read `id` (always present on canonical blocks). */
function readId(a: Record<string, unknown>): string {
  return a.id as string;
}

/** Apply `id` and optional `style` onto a partial block. */
function withBase<T extends { id: string; style?: NodeStyle }>(
  a: Record<string, unknown>,
  partial: Omit<T, "id" | "style">
): T {
  const block = { id: readId(a), ...partial } as T;
  const style = a.style;
  if (style !== undefined && style !== null) {
    (block as { style?: NodeStyle }).style = style as NodeStyle;
  }
  return block;
}

// ---------------------------------------------------------------------------
// Inline mapping
// ---------------------------------------------------------------------------

function pmToInline(node: PMNode): Inline {
  if (node.type === "inlineMath") {
    const a = attrs(node);
    const inline: Inline = { type: "inlineMath", latex: a.latex as string };
    if (a.alt !== undefined && a.alt !== null) inline.alt = a.alt as string;
    return inline;
  }
  // text node
  const marks: PMMark[] = node.marks ?? [];
  const canonicalMarks: ("bold" | "italic" | "underline" | "strike")[] = [];
  let color: string | undefined;
  for (const m of marks) {
    if (TEXT_MARK_NAMES.has(m.type)) {
      canonicalMarks.push(m.type as (typeof MARK_ORDER)[number]);
    } else if (m.type === "textStyle") {
      const c = m.attrs?.color;
      if (c !== undefined && c !== null) color = c as string;
    }
  }
  /* v8 ignore next -- defensive: PM text nodes always carry a non-empty text */
  const text: Inline = { type: "text", text: node.text ?? "" };
  if (canonicalMarks.length > 0) {
    // Normalize ordering so the round-trip is stable regardless of PM's order.
    text.marks = MARK_ORDER.filter((m) => canonicalMarks.includes(m));
  }
  if (color !== undefined) text.color = color;
  return text;
}

function pmToRichText(content: PMNode[] | undefined): RichText {
  return (content ?? []).map(pmToInline);
}

// ---------------------------------------------------------------------------
// Block mapping
// ---------------------------------------------------------------------------

function pmToBlock(node: PMNode): Block {
  const a = attrs(node);
  switch (node.type) {
    case "heading":
      return withBase<Extract<Block, { type: "heading" }>>(a, {
        type: "heading",
        level: a.level as 1 | 2 | 3,
        content: pmToRichText(node.content),
      });
    case "paragraph":
      return withBase<Extract<Block, { type: "paragraph" }>>(a, {
        type: "paragraph",
        content: pmToRichText(node.content),
      });
    case "blockMath": {
      const block = withBase<Extract<Block, { type: "blockMath" }>>(a, {
        type: "blockMath",
        latex: a.latex as string,
      });
      if (a.alt !== undefined && a.alt !== null) block.alt = a.alt as string;
      return block;
    }
    case "image": {
      const block = withBase<Extract<Block, { type: "image" }>>(a, {
        type: "image",
        src: a.src as string,
        alt: a.alt as string,
      });
      if (a.width !== undefined && a.width !== null) block.width = a.width as number;
      if (a.alignment !== undefined && a.alignment !== null) {
        block.alignment = a.alignment as "left" | "center" | "right";
      }
      if (a.caption !== undefined && a.caption !== null) {
        block.caption = a.caption as RichText;
      }
      return block;
    }
    case "scaffolding":
      return withBase<Extract<Block, { type: "scaffolding" }>>(a, {
        type: "scaffolding",
        items: a.items as string[],
      });
    case "divider":
      return withBase<Extract<Block, { type: "divider" }>>(a, {
        type: "divider",
      });
    case "question": {
      const block = withBase<Extract<Block, { type: "question" }>>(a, {
        type: "question",
        // question requires `block+` content, so node.content is always present.
        stem: (node.content as PMNode[]).map(pmToBlock),
        answer: a.answer as Extract<Block, { type: "question" }>["answer"],
      });
      if (a.number !== undefined && a.number !== null) {
        block.number = a.number as number;
      }
      if (a.points !== undefined && a.points !== null) {
        block.points = a.points as number;
      }
      if (a.difficulty !== undefined && a.difficulty !== null) {
        block.difficulty = a.difficulty as "facil" | "medio" | "dificil";
      }
      if (a.instruction !== undefined && a.instruction !== null) {
        block.instruction = a.instruction as RichText;
      }
      return block;
    }
    /* v8 ignore next 2 -- exhaustive switch; schema admits no other node type */
    default:
      throw new Error(`Unknown PM node type: ${node.type}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Convert a ProseMirror doc JSON to a validated CanonicalDocument.
 * Throws (via validateDocument) with a readable message if the result is
 * not a valid canonical document.
 */
export function proseMirrorToCanonical(pmDocJSON: PMNode): CanonicalDocument {
  // A doc with blocks always has a content array.
  const blocks = (pmDocJSON.content as PMNode[]).map(pmToBlock);
  const doc = { schemaVersion: 1 as const, blocks };
  return validateDocument(doc);
}
