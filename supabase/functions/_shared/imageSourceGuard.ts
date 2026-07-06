// =============================================================================
// Edge-only guard against fabricated AI image URLs. The AI is text-only and
// sometimes invents image `src` values (dead CORS on screen, holes in the PDF).
// The only trustworthy image source is an [IMAGEM: <url>] marker in the input.
// This module (a) extracts the allowlist of marker URLs and (b) rewrites any
// image block whose src is not in it into a text paragraph (the alt as a note).
//
// Lives in _shared/ (edge-only, Vitest-covered). Imports the canonical types
// ONLY as types, with explicit .ts extension for Deno. Never touches the shared
// isSafeImageSrc/schema, so browser parsing/render is unaffected.
// =============================================================================

import type {
  AdaptationResult,
  Block,
  RichText,
} from "../../../src/lib/adaptation/canonical/schema.ts";

/**
 * HTML-unescape the five entities that `sanitize()` produces, then trim. Used to
 * compare marker URLs and image `src` on equal footing regardless of whether the
 * model copied the escaped (`&amp;`) or decoded (`&`) form. `&amp;` is decoded
 * last so `&amp;lt;` never collapses into `<`.
 */
function normalizeUrl(url: string): string {
  return url
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .trim();
}

/**
 * Extract the set of legitimate image URLs from `[IMAGEM: <url>]` markers in the
 * activity text. Pass the SAME (sanitized) text the model received.
 */
export function extractImageMarkers(text: string): Set<string> {
  const out = new Set<string>();
  const re = /\[IMAGEM:\s*([^\]]+)\]/gi;
  let match: RegExpExecArray | null;
  while ((match = re.exec(text)) !== null) {
    const url = normalizeUrl(match[1]);
    if (url) out.add(url);
  }
  return out;
}

/** Turn a fabricated image block into a text paragraph carrying its alt. */
function imageToParagraph(block: Extract<Block, { type: "image" }>): Block {
  const alt = block.alt.trim();
  const content: RichText = alt ? [{ type: "text", text: alt }] : [];
  return {
    id: block.id,
    type: "paragraph",
    content,
    ...(block.style && { style: block.style }),
  };
}

/**
 * Rewrite every image block whose `src` did not come from an [IMAGEM:] marker in
 * the original activity into a text paragraph (its alt as a note). Walks
 * top-level blocks and question stems — images never nest deeper (the AI schema
 * forbids questions inside stems). Returns a new AdaptationResult; block counts
 * are preserved so the document stays valid (blocks.min(1)).
 */
export function stripFabricatedImages(
  result: AdaptationResult,
  allowedSrcs: Set<string>,
): AdaptationResult {
  const clean = (block: Block): Block => {
    if (block.type === "image") {
      return allowedSrcs.has(normalizeUrl(block.src)) ? block : imageToParagraph(block);
    }
    if (block.type === "question") {
      return { ...block, stem: block.stem.map(clean) };
    }
    return block;
  };
  return {
    ...result,
    document: { ...result.document, blocks: result.document.blocks.map(clean) },
  };
}
