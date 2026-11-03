/**
 * PDF export trigger.
 *
 * `buildPdfDocument` is the pure, fully-tested entry: it returns the
 * `<AdaptationPdf>` element for a canonical document + panel settings +
 * optional page style (Fase 4a).
 *
 * `downloadPdf` is the thin side-effecting glue that turns that element into a
 * Blob via react-pdf and triggers a browser download. The blob/download
 * side-effect is the only part guarded by a v8 ignore.
 */

import { createElement, type ReactElement } from "react";
import { pdf } from "@react-pdf/renderer";
import type { CanonicalDocument, PageStyle } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings } from "./panelSettings";
import { DEFAULT_PANEL_SETTINGS } from "./panelSettings";
import { AdaptationPdf } from "@/components/adaptation/render/pdf/AdaptationPdf";
import { registerPdfFonts } from "@/components/adaptation/render/pdf/registerFonts";
import { documentTitle } from "@/components/adaptation/titleField";

/** Build the react-pdf <Document> element for the given document + settings + optional page style. */
export function buildPdfDocument(
  document: CanonicalDocument,
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
  pageStyle?: PageStyle,
): ReactElement {
  registerPdfFonts();
  return createElement(AdaptationPdf, { document, settings, pageStyle });
}

/**
 * Derive a safe download filename from the panel header title.
 *
 * Achado 0100: with no header title, fall back to the document's first heading
 * (`documentTitle`), the same chain the printed title and the PDF /Title use.
 */
export function pdfFileName(
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
  document?: CanonicalDocument,
): string {
  const title = settings.header.title?.trim() || (document ? documentTitle(document) : "");
  if (!title) return "atividade-adaptada.pdf";
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "atividade-adaptada"}.pdf`;
}

/* v8 ignore start -- blob generation + DOM download side-effect (no logic to unit-test) */
export async function downloadPdf(
  document: CanonicalDocument,
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
  pageStyle?: PageStyle,
): Promise<void> {
  const element = buildPdfDocument(document, settings, pageStyle);
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = pdfFileName(settings, document);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
/* v8 ignore stop */
