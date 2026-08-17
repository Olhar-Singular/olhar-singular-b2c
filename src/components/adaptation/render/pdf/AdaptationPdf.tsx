/**
 * AdaptationPdf — the top-level react-pdf <Document><Page> for a canonical
 * document. Renders an optional header (from panel settings) followed by every
 * block via the PdfBlock dispatcher.
 *
 * Since Fase 4a the base font family, font size, and inter-block gap are
 * resolved from `pageStyle` (document-level "Aparência") via `resolvePageStyle`
 * and `pageTokensToPdf`, so they reflect the user's design choices in the PDF
 * with parity to the screen renderer.
 *
 * This is the PDF parity contract for CanonicalRenderer: each block flows
 * through PdfBlock, the same way each block flows through BlockView on screen.
 */

import { Document, Page, View, Text } from "@react-pdf/renderer";
import type { CanonicalDocument, PageStyle } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings, HeaderSettings } from "@/components/adaptation/export/panelSettings";
import {
  DEFAULT_PANEL_SETTINGS,
  formatHeaderDateBR,
  hasHeaderContent,
} from "@/components/adaptation/export/panelSettings";
import { PdfBlock } from "./PdfBlock";
import { questionNumbers } from "../questionNumbering";
import { perQuestionBreakFlags } from "../perQuestionBreaks";
import { pageTokensToPdf } from "../pageTokens";
import { HEADER_SPACING_PT } from "../headerSpacing";
import { resolvePageStyle, resolveElementFontSizes } from "../pageStyle";

/** Convert pixels (screen) to points (PDF). 1px = 72/96 pt. */
const px2pt = (px: number): number => px * (72 / 96);

export function PdfHeader({ header }: { header: HeaderSettings }) {
  if (!hasHeaderContent(header)) return null;
  return (
    <View
      style={{
        marginBottom: HEADER_SPACING_PT.bottomMargin,
        paddingBottom: HEADER_SPACING_PT.bottomPadding,
        borderBottomWidth: 1,
        borderBottomColor: "#333333",
      }}
    >
      {header.title && header.title.trim() !== "" && (
        <Text style={{ fontSize: 18, fontWeight: "bold", textAlign: "center" }}>{header.title}</Text>
      )}
      {header.school && header.school.trim() !== "" && (
        <Text style={{ fontSize: 11, textAlign: "center", marginTop: HEADER_SPACING_PT.schoolTop }}>
          {header.school}
        </Text>
      )}
      <View
        style={{
          flexDirection: "row",
          justifyContent: "space-between",
          marginTop: HEADER_SPACING_PT.metaTop,
          fontSize: 10,
        }}
      >
        {header.teacher && header.teacher.trim() !== "" ? (
          <Text>Professor(a): {header.teacher}</Text>
        ) : (
          <Text> </Text>
        )}
        {header.date && header.date.trim() !== "" ? (
          <Text>Data: {formatHeaderDateBR(header.date)}</Text>
        ) : (
          <Text> </Text>
        )}
      </View>
    </View>
  );
}

/**
 * Distância (pt) entre a base da folha e o rodapé fixo. Menor que
 * `PAGE_MARGIN_PT`, então o rodapé mora DENTRO da margem inferior: ele não entra
 * no fluxo dos blocos nem empurra o conteúdo da página 1.
 */
export const FOOTER_BOTTOM_PT = 18;

/**
 * Texto do rodapé de uma página. Prova é folha solta: sem isto, a partir da
 * página 2 o papel sai sem título, sem escola e sem número (achado 0119), e
 * ninguém percebe que faltou uma folha no monte.
 *
 * Título e escola em branco são descartados para não sobrar separador solto.
 */
export function pdfFooterLabel(
  header: HeaderSettings,
  pageNumber: number,
  totalPages: number,
): string {
  const parts = [header.title, header.school]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "");
  parts.push(`Página ${pageNumber} de ${totalPages}`);
  return parts.join(" · ");
}

/**
 * Rodapé repetido em TODA página (`fixed` do react-pdf), posicionado dentro da
 * margem inferior. É a única superfície do PDF que identifica a folha a partir
 * da página 2, já que `PdfHeader` flui com o conteúdo e sai uma vez só.
 */
export function PdfPageFooter({ header }: { header: HeaderSettings }) {
  return (
    <Text
      fixed
      style={{
        position: "absolute",
        bottom: FOOTER_BOTTOM_PT,
        left: 0,
        right: 0,
        textAlign: "center",
        fontSize: 8,
        color: "#555555",
      }}
      render={({ pageNumber, totalPages }) => pdfFooterLabel(header, pageNumber, totalPages)}
    />
  );
}

type Props = {
  document: CanonicalDocument;
  settings?: PanelSettings;
  pageStyle?: PageStyle;
};

export function AdaptationPdf({ document, settings = DEFAULT_PANEL_SETTINGS, pageStyle }: Props) {
  const resolved = resolvePageStyle(pageStyle);
  // Convert blockSpacing from px (screen unit) to pt (PDF unit).
  const blockGap = px2pt(resolved.blockSpacing);
  // Resolved ONCE per document and handed down, so every mapper reads the same
  // per-element sizes the screen sheet emits as --doc-fs-* vars.
  const elementSizes = resolveElementFontSizes(resolved);

  return (
    <Document>
      <Page size="A4" style={pageTokensToPdf(resolved)}>
        <PdfHeader header={settings.header} />
        {(() => {
          const numbers = questionNumbers(document.blocks);
          // Mesma derivação que a prévia do Exportar desenha como régua tracejada.
          const breaks = perQuestionBreakFlags(document.blocks);
          return document.blocks.map((block, i) => {
            const forceBreak = settings.pageBreakPerQuestion && breaks[i];
            return forceBreak ? (
              <View key={block.id} break>
                <PdfBlock block={block} number={numbers[i]} blockGap={blockGap} elementSizes={elementSizes} />
              </View>
            ) : (
              <PdfBlock key={block.id} block={block} number={numbers[i]} blockGap={blockGap} elementSizes={elementSizes} />
            );
          });
        })()}
        <PdfPageFooter header={settings.header} />
      </Page>
    </Document>
  );
}

export default AdaptationPdf;
