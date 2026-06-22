/**
 * canonical -> ProseMirror JSON.
 *
 * Pure, deterministic mapping. The produced JSON is a valid ProseMirror doc for
 * the schema in ./schema.ts and can be loaded with `Node.fromJSON(schema, json)`.
 *
 * Invariant: `proseMirrorToCanonical(canonicalToProseMirror(doc))` deep-equals
 * `doc` for every valid CanonicalDocument (see round-trip tests).
 */

import type {
  Block,
  CanonicalDocument,
  Inline,
  RichText,
} from "../canonical/schema";

// ---------------------------------------------------------------------------
// Types for the (minimal) ProseMirror JSON we emit
// ---------------------------------------------------------------------------

export interface PMMark {
  type: string;
  attrs?: Record<string, unknown>;
}

export interface PMNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: PMNode[];
  marks?: PMMark[];
  text?: string;
}

// ---------------------------------------------------------------------------
// Inline mapping
// ---------------------------------------------------------------------------

export function inlineToPM(node: Inline): PMNode {
  if (node.type === "inlineMath") {
    const attrs: Record<string, unknown> = { latex: node.latex };
    if (node.alt !== undefined) attrs.alt = node.alt;
    return { type: "inlineMath", attrs };
  }
  // text run
  const marks: PMMark[] = [];
  for (const m of node.marks ?? []) {
    marks.push({ type: m });
  }
  // Merge color and fontSize into a single textStyle mark — ProseMirror collapses
  // duplicate mark types, so two separate textStyle marks would conflict.
  const textStyleAttrs: Record<string, unknown> = {};
  if (node.color !== undefined) textStyleAttrs.color = node.color;
  if (node.fontSize !== undefined) {
    textStyleAttrs.fontSize = `${node.fontSize * (96 / 72)}px`;
  }
  if (Object.keys(textStyleAttrs).length > 0) {
    marks.push({ type: "textStyle", attrs: textStyleAttrs });
  }
  const pm: PMNode = { type: "text", text: node.text };
  if (marks.length > 0) pm.marks = marks;
  return pm;
}

/** Convert RichText (inline array) to PM inline content. */
export function richTextToPM(rich: RichText): PMNode[] {
  return rich.map(inlineToPM);
}

// ---------------------------------------------------------------------------
// Block attrs (id + style)
// ---------------------------------------------------------------------------

function baseAttrs(block: { id: string; style?: unknown }): Record<string, unknown> {
  const attrs: Record<string, unknown> = { id: block.id };
  if (block.style !== undefined) attrs.style = block.style;
  return attrs;
}

// ---------------------------------------------------------------------------
// Block mapping
// ---------------------------------------------------------------------------

function blockToPM(block: Block): PMNode {
  switch (block.type) {
    case "heading":
      return {
        type: "heading",
        attrs: { ...baseAttrs(block), level: block.level },
        content: richTextToPM(block.content),
      };
    case "paragraph":
      return {
        type: "paragraph",
        attrs: baseAttrs(block),
        content: richTextToPM(block.content),
      };
    case "blockMath": {
      const attrs = baseAttrs(block);
      attrs.latex = block.latex;
      if (block.alt !== undefined) attrs.alt = block.alt;
      return { type: "blockMath", attrs };
    }
    case "image": {
      const attrs = baseAttrs(block);
      attrs.src = block.src;
      attrs.alt = block.alt;
      if (block.width !== undefined) attrs.width = block.width;
      if (block.alignment !== undefined) attrs.alignment = block.alignment;
      if (block.caption !== undefined) attrs.caption = block.caption;
      return { type: "image", attrs };
    }
    case "scaffolding": {
      const attrs = baseAttrs(block);
      attrs.items = block.items;
      return { type: "scaffolding", attrs };
    }
    case "divider":
      return { type: "divider", attrs: baseAttrs(block) };
    case "question": {
      const attrs = baseAttrs(block);
      if (block.instruction !== undefined) attrs.instruction = block.instruction;
      if (block.enunciado !== undefined) attrs.enunciado = block.enunciado;
      if (block.enunciadoPosition !== undefined) attrs.enunciadoPosition = block.enunciadoPosition;
      attrs.answer = block.answer;
      return {
        type: "question",
        attrs,
        content: block.stem.map(blockToPM),
      };
    }
    /* v8 ignore next 2 -- exhaustive switch; canonical schema admits no other block type */
    default:
      throw new Error(`Unknown block type: ${(block as { type: string }).type}`);
  }
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/** Convert a CanonicalDocument to a ProseMirror doc JSON object. */
export function canonicalToProseMirror(doc: CanonicalDocument): PMNode {
  return {
    type: "doc",
    content: doc.blocks.map(blockToPM),
  };
}
