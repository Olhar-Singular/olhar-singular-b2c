/**
 * PDF export trigger.
 *
 * `buildPdfDocument` is the pure, fully-tested entry: it returns the
 * `<AdaptationPdf>` element for a canonical document + panel settings.
 *
 * `downloadPdf` is the thin side-effecting glue that turns that element into a
 * Blob via react-pdf and triggers a browser download. The blob/download
 * side-effect is the only part guarded by a v8 ignore.
 */

import { createElement, type ReactElement } from "react";
import { pdf } from "@react-pdf/renderer";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings } from "./panelSettings";
import { DEFAULT_PANEL_SETTINGS } from "./panelSettings";
import { AdaptationPdf } from "@/components/adaptation/render/pdf/AdaptationPdf";

/** Build the react-pdf <Document> element for the given document + settings. */
export function buildPdfDocument(
  document: CanonicalDocument,
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
): ReactElement {
  return createElement(AdaptationPdf, { document, settings });
}

/** Derive a safe download filename from the panel header title. */
export function pdfFileName(settings: PanelSettings = DEFAULT_PANEL_SETTINGS): string {
  const title = settings.header.title?.trim();
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
): Promise<void> {
  const element = buildPdfDocument(document, settings);
  const blob = await pdf(element).toBlob();
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = pdfFileName(settings);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
/* v8 ignore stop */
