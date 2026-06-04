/**
 * AdaptationPdf — the top-level react-pdf <Document><Page> for a canonical
 * document. Renders an optional header (from panel settings) followed by every
 * block via the PdfBlock dispatcher. The base font family and the global
 * page-break-per-question toggle come from the panel settings.
 *
 * This is the PDF parity contract for CanonicalRenderer: each block flows
 * through PdfBlock, the same way each block flows through BlockView on screen.
 */

import { Document, Page, View, Text } from "@react-pdf/renderer";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings, HeaderSettings } from "@/components/adaptation/export/panelSettings";
import { DEFAULT_PANEL_SETTINGS, hasHeaderContent } from "@/components/adaptation/export/panelSettings";
import { PdfBlock } from "./PdfBlock";

export function PdfHeader({ header }: { header: HeaderSettings }) {
  if (!hasHeaderContent(header)) return null;
  return (
    <View
      style={{ marginBottom: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: "#333333" }}
    >
      {header.title && header.title.trim() !== "" && (
        <Text style={{ fontSize: 18, fontWeight: "bold", textAlign: "center" }}>{header.title}</Text>
      )}
      {header.school && header.school.trim() !== "" && (
        <Text style={{ fontSize: 11, textAlign: "center" }}>{header.school}</Text>
      )}
      <View style={{ flexDirection: "row", justifyContent: "space-between", marginTop: 6, fontSize: 10 }}>
        {header.teacher && header.teacher.trim() !== "" ? (
          <Text>Professor(a): {header.teacher}</Text>
        ) : (
          <Text> </Text>
        )}
        {header.date && header.date.trim() !== "" ? <Text>Data: {header.date}</Text> : <Text> </Text>}
      </View>
    </View>
  );
}

type Props = {
  document: CanonicalDocument;
  settings?: PanelSettings;
};

export function AdaptationPdf({ document, settings = DEFAULT_PANEL_SETTINGS }: Props) {
  return (
    <Document>
      <Page
        size="A4"
        style={{ padding: 40, fontFamily: settings.fontFamily, fontSize: 12, lineHeight: 1.4 }}
      >
        <PdfHeader header={settings.header} />
        {document.blocks.map((block, i) => {
          const forceBreak =
            settings.pageBreakPerQuestion && block.type === "question" && i > 0;
          return forceBreak ? (
            <View key={block.id} break>
              <PdfBlock block={block} />
            </View>
          ) : (
            <PdfBlock key={block.id} block={block} />
          );
        })}
      </Page>
    </Document>
  );
}

export default AdaptationPdf;
