/**
 * Leaf block PDF mappers — heading, paragraph, image, scaffolding, divider.
 * PDF analogues of the matching screen views. Each maps `nodeStyle` via
 * nodeStyleToPdf and reuses PdfRichText for inline content.
 *
 * Layout note: PdfHeading and PdfParagraph wrap their <Text> in a <View> so
 * the block participates in Yoga layout as a proper flex-column child. A bare
 * <Text> can lose its marginBottom in react-pdf when mixed with <View> siblings
 * in the same column (the text measure path bypasses Yoga's margin accounting).
 * The <View> carries the block margin; the inner <Text> handles text styling.
 *
 * `blockGap` (in pt) is the doc-level default inter-block gap resolved from
 * pageStyle. A per-block `style.spacingAfter` (from nodeStyleToPdf) overrides
 * it. image/scaffolding/divider have their own intrinsic structural spacing and
 * do NOT use blockGap — but spacingAfter still overrides via nodeStyleToPdf spread.
 */

import { View, Text, Image } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf } from "./nodeStyleToPdf";
import { PdfRichText } from "./PdfRichText";
import { PAGE_MARGIN_PT, DEFAULT_IMAGE_WIDTH_PX } from "../pageTokens";

type HeadingBlock = Extract<Block, { type: "heading" }>;
type ParagraphBlock = Extract<Block, { type: "paragraph" }>;
type ImageBlock = Extract<Block, { type: "image" }>;
type ScaffoldingBlock = Extract<Block, { type: "scaffolding" }>;
type DividerBlock = Extract<Block, { type: "divider" }>;

const HEADING_SIZE: Record<1 | 2 | 3, number> = { 1: 22, 2: 18, 3: 15 };

export function PdfHeading({ block, blockGap = 12 }: { block: HeadingBlock; blockGap?: number }) {
  // Extract marginBottom from nodeStyleToPdf (spacingAfter) and fall back to blockGap.
  // Other text styles (fontSize, fontWeight, textAlign, color, fontFamily) stay on
  // the inner <Text> so they apply to the text content, not the layout container.
  const nodeStyle = nodeStyleToPdf(block.style);
  const { marginBottom: nodeMarginBottom, ...textStyle } = nodeStyle;
  const marginBottom = nodeMarginBottom ?? blockGap;
  return (
    <View style={{ marginBottom }}>
      <Text style={{ fontSize: HEADING_SIZE[block.level], fontWeight: "bold", ...textStyle }}>
        <PdfRichText content={block.content} />
      </Text>
    </View>
  );
}

export function PdfParagraph({ block, blockGap = 12 }: { block: ParagraphBlock; blockGap?: number }) {
  const nodeStyle = nodeStyleToPdf(block.style);
  const { marginBottom: nodeMarginBottom, ...textStyle } = nodeStyle;
  const marginBottom = nodeMarginBottom ?? blockGap;
  return (
    <View style={{ marginBottom }}>
      <Text style={textStyle}>
        <PdfRichText content={block.content} />
      </Text>
    </View>
  );
}

const IMAGE_ALIGN: Record<NonNullable<ImageBlock["alignment"]>, "flex-start" | "center" | "flex-end"> = {
  left: "flex-start",
  center: "center",
  right: "flex-end",
};

/** Convert pixels (screen unit) to points (PDF unit). 1px = 72/96 pt. */
const px2pt = (px: number): number => px * (72 / 96);

/** A4 page height in pt — the only page size used (see AdaptationPdf's `<Page size="A4">`). */
const A4_HEIGHT_PT = 841.89;

/**
 * Upper bound (pt) for an image's rendered height. react-pdf cannot wrap an
 * <Image> across pages, so an image taller than the page is drawn overflowing —
 * painting over the blocks below it (the bug this guards against). Capping the
 * height keeps a tall image within a single page so react-pdf paginates cleanly.
 *
 * Derived from page geometry (so it stays correct if the margin changes): ~92%
 * of the A4 content height (841.89 − 2×40 ≈ 761.89pt → ≈701pt), leaving ~8%
 * headroom — empirically the band above which react-pdf flags the image as
 * un-wrappable (~750pt).
 */
const MAX_IMAGE_HEIGHT_PT = (A4_HEIGHT_PT - 2 * PAGE_MARGIN_PT) * 0.92;

export function PdfImage({ block }: { block: ImageBlock }) {
  const alignItems = block.alignment ? IMAGE_ALIGN[block.alignment] : "flex-start";
  return (
    <View style={{ alignItems, marginBottom: 4, ...nodeStyleToPdf(block.style) }}>
      {/*
        Mirror the screen's `max-w-full`: never wider than the content box and
        never taller than a page. `objectFit: "contain"` preserves the aspect
        ratio when either cap clamps the box. The width (stored in px, screen
        units) is converted to pt for physical parity with the screen. When the
        block carries no width, fall back to DEFAULT_IMAGE_WIDTH_PX (the size the
        editor's resizer shows) instead of letting react-pdf stretch a widthless
        <Image> across the whole content box — that ballooning is the bug this
        guards against for un-resized/AI images.
      */}
      <Image
        src={block.src}
        style={{
          maxWidth: "100%",
          maxHeight: MAX_IMAGE_HEIGHT_PT,
          objectFit: "contain",
          width: px2pt(block.width ?? DEFAULT_IMAGE_WIDTH_PX),
        }}
      />
      {block.caption && (
        <Text style={{ fontSize: 10, color: "#666666", marginTop: 2 }}>
          <PdfRichText content={block.caption} />
        </Text>
      )}
    </View>
  );
}

export function PdfScaffolding({ block }: { block: ScaffoldingBlock }) {
  return (
    <View style={{ backgroundColor: "#F3F4F6", borderWidth: 1, borderColor: "#E5E7EB", padding: 6, marginVertical: 6, ...nodeStyleToPdf(block.style) }}>
      {block.items.map((item, i) => (
        <Text key={i} style={{ marginBottom: 2 }}>
          {i + 1}. {item}
        </Text>
      ))}
    </View>
  );
}

export function PdfDivider({ block }: { block: DividerBlock }) {
  return (
    <View
      style={{ borderBottomWidth: 1, borderBottomColor: "#999999", marginVertical: 8, ...nodeStyleToPdf(block.style) }}
    />
  );
}
