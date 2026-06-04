/**
 * Leaf block PDF mappers — heading, paragraph, image, scaffolding, divider.
 * PDF analogues of the matching screen views. Each maps `nodeStyle` via
 * nodeStyleToPdf and reuses PdfRichText for inline content.
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

export function PdfHeading({ block }: { block: HeadingBlock }) {
  return (
    <Text style={{ fontSize: HEADING_SIZE[block.level], fontWeight: "bold", marginBottom: 4, ...nodeStyleToPdf(block.style) }}>
      <PdfRichText content={block.content} />
    </Text>
  );
}

export function PdfParagraph({ block }: { block: ParagraphBlock }) {
  return (
    <Text style={{ marginBottom: 4, ...nodeStyleToPdf(block.style) }}>
      <PdfRichText content={block.content} />
    </Text>
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
