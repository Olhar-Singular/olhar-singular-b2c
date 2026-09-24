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
 * it. O vão ENTRE blocos de topo é um só valor, o do documento: imagem e
 * divisor também o gastam (achado 0130). Antes eles traziam 4pt e 8pt à mão,
 * então subir o "espaçamento entre blocos" — o ajuste de quem precisa de menos
 * densidade na folha — não abria um ponto sequer no papel onde houvesse imagem
 * ou divisor, e a paginação impressa deixava de bater com a prévia. O que
 * continua intrínseco é o espaçamento INTERNO do bloco (o padding do andaime, o
 * respiro da legenda), não a junta com o bloco seguinte.
 *
 * O andaime é a exceção declarada: ele gasta o mesmo token nas três superfícies
 * (`SCAFFOLDING_MARGIN_Y`, achado 0124), contrato guardado por
 * `render/scaffoldingParity.test.tsx`.
 */

import type { ReactNode } from "react";
import { View, Text, Image } from "@react-pdf/renderer";
import type { Block } from "@/lib/adaptation/canonical/schema";
import { nodeStyleToPdf } from "./nodeStyleToPdf";
import { PdfRichText } from "./PdfRichText";
import {
  PAGE_MARGIN_PT,
  DEFAULT_IMAGE_WIDTH_PX,
  SCAFFOLDING_PADDING_PT,
  SCAFFOLDING_MARGIN_Y_PT,
  SCAFFOLDING_RADIUS_PT,
  scaffoldingStepColumnPt,
  SCAFFOLDING_BG,
  SCAFFOLDING_BORDER,
  SCAFFOLDING_LABEL,
  INK_MUTED,
  RULE_COLOR,
  RULE_WIDTH_PT,
  HEADING_PT,
  BASE_FONT_PT,
  pdfTextSize,
} from "../pageTokens";
import { resolveElementFontSizes, resolvePageStyle, type ElementFontSizesPt } from "../pageStyle";

/** Sizes used when a leaf block is rendered standalone. */
const DEFAULT_ELEMENT_SIZES = resolveElementFontSizes(resolvePageStyle());

type HeadingBlock = Extract<Block, { type: "heading" }>;
type ParagraphBlock = Extract<Block, { type: "paragraph" }>;
type ImageBlock = Extract<Block, { type: "image" }>;
type ScaffoldingBlock = Extract<Block, { type: "scaffolding" }>;
type DividerBlock = Extract<Block, { type: "divider" }>;

// Screen heading sizes (text-2xl/xl/lg = 24/20/18px) converted px→pt for parity.
// Vive em pageTokens porque o Word lê o mesmo valor (achado 0164).
const HEADING_SIZE = HEADING_PT;

export function PdfHeading({ block, blockGap = 12 }: { block: HeadingBlock; blockGap?: number }) {
  // Extract marginBottom from nodeStyleToPdf (spacingAfter) and fall back to blockGap.
  // Other text styles (fontSize, fontWeight, textAlign, color, fontFamily) stay on
  // the inner <Text> so they apply to the text content, not the layout container.
  const nodeStyle = nodeStyleToPdf(block.style);
  const { marginBottom: nodeMarginBottom, ...textStyle } = nodeStyle;
  const marginBottom = nodeMarginBottom ?? blockGap;
  return (
    <View style={{ marginBottom }}>
      <Text style={{ ...pdfTextSize(HEADING_SIZE[block.level]), fontWeight: "bold", ...textStyle }}>
        <PdfRichText content={block.content} fontSize={HEADING_SIZE[block.level]} />
      </Text>
    </View>
  );
}

/**
 * `numberPrefix` é um run opcional emitido ANTES do conteúdo, dentro do mesmo
 * <Text>. Serve ao número da questão que abre com parágrafo: no mesmo <Text>
 * ele divide a linha de base do enunciado em vez de flutuar numa coluna irmã de
 * altura própria (achado 0428).
 */
export function PdfParagraph({
  block,
  blockGap = 12,
  numberPrefix,
  baseFontSize = BASE_FONT_PT,
}: {
  block: ParagraphBlock;
  blockGap?: number;
  numberPrefix?: ReactNode;
  /** Corpo do documento (pt), herdado do <Page>: é o contexto da fórmula inline (0402). */
  baseFontSize?: number;
}) {
  const nodeStyle = nodeStyleToPdf(block.style);
  const { marginBottom: nodeMarginBottom, ...textStyle } = nodeStyle;
  const marginBottom = nodeMarginBottom ?? blockGap;
  return (
    <View style={{ marginBottom }}>
      <Text style={textStyle}>
        {numberPrefix}
        <PdfRichText content={block.content} fontSize={baseFontSize} />
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

export function PdfImage({
  block,
  blockGap = 12,
  elementSizes = DEFAULT_ELEMENT_SIZES,
}: {
  block: ImageBlock;
  blockGap?: number;
  elementSizes?: ElementFontSizesPt;
}) {
  const alignItems = block.alignment ? IMAGE_ALIGN[block.alignment] : "flex-start";
  return (
    <View style={{ alignItems, marginBottom: blockGap, ...nodeStyleToPdf(block.style) }}>
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
        <Text style={{ ...pdfTextSize(elementSizes.caption), color: INK_MUTED, marginTop: 2 }}>
          <PdfRichText content={block.caption} fontSize={elementSizes.caption} />
        </Text>
      )}
    </View>
  );
}

export function PdfScaffolding({
  block,
  elementSizes = DEFAULT_ELEMENT_SIZES,
}: {
  block: ScaffoldingBlock;
  elementSizes?: ElementFontSizesPt;
}) {
  return (
    <View
      // A moldura é indivisível: sem isto o react-pdf parte a View que não cabe
      // e repinta fundo, borda e cantos na folha seguinte, abrindo a página com
      // uma tira bege vazia (o padding e a borda de baixo) enquanto as duas
      // telas mostram a caixa sempre inteira (achado 0177).
      wrap={false}
      style={{
        backgroundColor: SCAFFOLDING_BG,
        borderWidth: RULE_WIDTH_PT,
        borderColor: SCAFFOLDING_BORDER,
        padding: SCAFFOLDING_PADDING_PT,
        marginVertical: SCAFFOLDING_MARGIN_Y_PT,
        // Sem isto o papel imprime a quina viva de uma moldura de tabela onde
        // as duas telas mostram um cartão de apoio (achado 0161).
        borderRadius: SCAFFOLDING_RADIUS_PT,
        ...nodeStyleToPdf(block.style),
      }}
    >
      {/* Rótulo da caixa: texto do documento, não chrome do editor. Sem ele a
          caixa sai do papel como um retângulo bege sem título — e o andaime,
          diferente de um título ou de uma legenda, não se identifica sozinho no
          impresso (achado 0155). O tamanho é o de legenda da folha, o mesmo que
          a prévia lê de `--doc-fs-caption`. */}
      <Text
        style={{
          ...pdfTextSize(elementSizes.caption),
          fontWeight: "bold",
          textTransform: "uppercase",
          marginBottom: 4,
        }}
      >
        {SCAFFOLDING_LABEL}
      </Text>
      {block.items.map((item, i) => (
        <View key={i} style={{ flexDirection: "row", marginBottom: 2 }}>
          {/* Coluna de ordinal derivada do corpo do documento: na base ela dá
              o recuo da <ol> da tela (mesma coluna nas duas superfícies), e
              acima do padrão ela cresce junto com o glifo, para o `1.` não
              quebrar com o ponto órfão na linha de baixo (achado 0176). */}
          <Text
            style={{
              width: scaffoldingStepColumnPt(String(i + 1), elementSizes.stem),
              flexShrink: 0,
            }}
          >
            {i + 1}.
          </Text>
          <Text style={{ flexGrow: 1, flexShrink: 1 }}>{item}</Text>
        </View>
      ))}
    </View>
  );
}

export function PdfDivider({ block, blockGap = 12 }: { block: DividerBlock; blockGap?: number }) {
  return (
    <View
      style={{
        borderBottomWidth: RULE_WIDTH_PT,
        borderBottomColor: RULE_COLOR,
        // Só o vão de BAIXO, como em todo bloco de topo: o de cima já vem do
        // `marginBottom` do bloco anterior (achado 0130). O `marginVertical: 8`
        // que morava aqui somava um segundo vão fixo acima do filete.
        marginBottom: blockGap,
        ...nodeStyleToPdf(block.style),
      }}
    />
  );
}
