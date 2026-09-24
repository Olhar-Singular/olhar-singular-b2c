/**
 * HeadingBlockView — read-only render of a canonical heading block. The
 * authored `level` (1/2/3) drives the semantic tag; no heuristic re-derivation.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RichTextView } from "../RichTextView";

type HeadingBlock = Extract<Block, { type: "heading" }>;

const LEVEL_CLASS: Record<1 | 2 | 3, string> = {
  1: "font-bold",
  2: "font-semibold",
  3: "font-semibold",
};

/**
 * Tamanho do título: token de página `--doc-fs-heading{level}`, publicado por
 * `pageTokensToCss` a partir do corpo do documento (achado 0412). Eram as
 * classes `text-2xl/xl/lg`, absolutas, então o controle "Tamanho do texto" do
 * popover Formato não movia o título nesta superfície nem nas outras duas. O
 * fallback repete o tamanho dessas classes para um render sem os tokens.
 */
const LEVEL_FONT_SIZE: Record<1 | 2 | 3, string> = {
  1: "var(--doc-fs-heading1, 1.5rem)",
  2: "var(--doc-fs-heading2, 1.25rem)",
  3: "var(--doc-fs-heading3, 1.125rem)",
};

export function HeadingBlockView({ block }: { block: HeadingBlock }) {
  const Tag = `h${block.level}` as const;
  return (
    <Tag
      className={LEVEL_CLASS[block.level]}
      style={{ fontSize: LEVEL_FONT_SIZE[block.level], ...nodeStyleToCss(block.style) }}
    >
      <RichTextView content={block.content} />
    </Tag>
  );
}

export default HeadingBlockView;
