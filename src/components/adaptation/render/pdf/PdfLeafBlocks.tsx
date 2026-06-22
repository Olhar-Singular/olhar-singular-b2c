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

export function PdfImage({ block }: { block: ImageBlock }) {
  const alignItems = block.alignment ? IMAGE_ALIGN[block.alignment] : "flex-start";
  return (
    <View style={{ alignItems, marginBottom: 4, ...nodeStyleToPdf(block.style) }}>
      <Image src={block.src} style={block.width ? { width: block.width } : undefined} />
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
