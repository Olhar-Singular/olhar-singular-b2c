/**
 * ImageBlockView — read-only render of a canonical image block, with optional
 * width, alignment and a rich-text caption rendered in a <figcaption>.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToCss } from "../style";
import { RichTextView } from "../RichTextView";

type ImageBlock = Extract<Block, { type: "image" }>;

const ALIGN_CLASS: Record<NonNullable<ImageBlock["alignment"]>, string> = {
  left: "text-left",
  center: "text-center",
  right: "text-right",
};

export function ImageBlockView({ block }: { block: ImageBlock }) {
  const alignClass = block.alignment ? ALIGN_CLASS[block.alignment] : "text-left";
  return (
    <figure className={alignClass} style={nodeStyleToCss(block.style)}>
      {/*
        `max-w-full` caps width to the container; height is intrinsic with no cap.
        Parity note: the PDF renderer (PdfImage) additionally caps image HEIGHT to
        a page-safe value, because react-pdf cannot wrap an image across pages — a
        very tall image is shrunk in the PDF where on screen it scrolls freely.
      */}
      <img
        src={block.src}
        alt={block.alt}
        width={block.width}
        className="inline-block max-w-full"
      />
      {block.caption && (
        <figcaption className="mt-1 text-sm text-muted-foreground">
          <RichTextView content={block.caption} />
        </figcaption>
      )}
    </figure>
  );
}

export default ImageBlockView;
