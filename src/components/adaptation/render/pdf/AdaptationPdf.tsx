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
import { BASE_LINE_HEIGHT, pageTokensToPdf, pdfTextSize, RULE_WIDTH_PT } from "../pageTokens";
import { HEADER_SPACING_PT } from "../headerSpacing";
import { resolvePageStyle, resolveElementFontSizes } from "../pageStyle";
import {
  FOOTER_BOTTOM_PT,
  FOOTER_COLOR,
  FOOTER_FONT_SIZE_PT,
  FOOTER_LINE_HEIGHT_PT,
  pdfFooterLabel,
} from "../footerLabel";

// Reexportados de `../footerLabel` (achado 0242): o texto e a medida do rodapé
// passaram a ser compartilhados com a prévia do Exportar, que não pode importar
// este módulo (ele arrasta o `@react-pdf/renderer` para o bundle da tela).
export { FOOTER_BOTTOM_PT, pdfFooterLabel };

/** Convert pixels (screen) to points (PDF). 1px = 72/96 pt. */
const px2pt = (px: number): number => px * (72 / 96);

/** Campo preenchido = existe e não é só espaço em branco. */
const filled = (value?: string): boolean => value !== undefined && value.trim() !== "";

export function PdfHeader({ header }: { header: HeaderSettings }) {
  if (!hasHeaderContent(header)) return null;
  // Achado 0243: campo vazio não vira `<Text> </Text>`; sem Professor(a) nem
  // Data a linha (e o `metaTop` dela) some, como já fazem o Word e o Copiar.
  const hasTeacher = filled(header.teacher);
  const hasDate = filled(header.date);
  return (
    <View
      style={{
        marginBottom: HEADER_SPACING_PT.bottomMargin,
        paddingBottom: HEADER_SPACING_PT.bottomPadding,
        // Espessura pelo token estrutural: `1` literal aqui é 1pt e saía 33%
        // mais grosso que o 1px (0,75pt) da prévia do Exportar (achado 0150).
        borderBottomWidth: RULE_WIDTH_PT,
        borderBottomColor: "#333333",
      }}
    >
      {header.title && header.title.trim() !== "" && (
        <Text style={{ ...pdfTextSize(18), fontWeight: "bold", textAlign: "center" }}>{header.title}</Text>
      )}
      {header.school && header.school.trim() !== "" && (
        <Text style={{ ...pdfTextSize(11), textAlign: "center", marginTop: HEADER_SPACING_PT.schoolTop }}>
          {header.school}
        </Text>
      )}
      {(hasTeacher || hasDate) && (
        <View
          style={{
            flexDirection: "row",
            justifyContent: "space-between",
            marginTop: HEADER_SPACING_PT.metaTop,
            ...pdfTextSize(10),
          }}
        >
          {hasTeacher && <Text>Professor(a): {header.teacher}</Text>}
          {hasDate && <Text>Data: {formatHeaderDateBR(header.date!)}</Text>}
        </View>
      )}
    </View>
  );
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
        fontSize: FOOTER_FONT_SIZE_PT,
        // Entrelinha própria + altura máxima de UMA linha (achado 0170). O
        // `@react-pdf` só executa `render` na hora de pintar, então mede este
        // `<Text>` como uma caixa fantasma de milhares de pontos; o `bottom`
        // resolvia contra ela e o rodapé era pintado ~7.777 pt abaixo do papel
        // (fora do box de toda página, por isso o `fixed` também não repetia).
        // Travar a altura devolve o `bottom` à caixa da página.
        lineHeight: BASE_LINE_HEIGHT,
        maxHeight: FOOTER_LINE_HEIGHT_PT,
        color: FOOTER_COLOR,
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

  // Achado 0310: metadados do PDF. `/Title` faz o visualizador e o leitor de
  // tela anunciarem a atividade (e não o nome do arquivo) e `/Lang` dá ao
  // sintetizador as regras de pronúncia do pt-BR (WCAG 3.1.1). O título sai do
  // mesmo `header.title` que já nomeia o cabeçalho impresso e o `.docx`.
  const documentTitle = settings.header.title?.trim() || "Atividade adaptada";

  return (
    <Document title={documentTitle} language="pt-BR">
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
                <PdfBlock
                  block={block}
                  number={numbers[i]}
                  blockGap={blockGap}
                  elementSizes={elementSizes}
                  baseFontSize={resolved.fontSize}
                />
              </View>
            ) : (
              <PdfBlock
                key={block.id}
                block={block}
                number={numbers[i]}
                blockGap={blockGap}
                elementSizes={elementSizes}
                baseFontSize={resolved.fontSize}
              />
            );
          });
        })()}
        <PdfPageFooter header={settings.header} />
      </Page>
    </Document>
  );
}

export default AdaptationPdf;
