/**
 * PanelSettings — user-facing export options held by the ExportPanel and passed
 * to the PDF builder: an optional header (title/school/teacher/date) and a
 * global page-break-per-question toggle.
 *
 * Since Fase 4a, font family/size/spacing come from the document-level
 * `pageStyle` (resolved via `resolvePageStyle` in the PDF renderer), NOT from a
 * panel font select. The `fontFamily` field and `PDF_FONTS`/`PdfFont` have been
 * removed.
 */

export type HeaderSettings = {
  title?: string;
  school?: string;
  teacher?: string;
  date?: string;
};

export type PanelSettings = {
  header: HeaderSettings;
  pageBreakPerQuestion: boolean;
};

export const DEFAULT_PANEL_SETTINGS: PanelSettings = {
  header: {},
  pageBreakPerQuestion: false,
};

/** True when at least one header field has non-empty content. */
export function hasHeaderContent(header: HeaderSettings): boolean {
  return [header.title, header.school, header.teacher, header.date].some(
    (v) => v !== undefined && v.trim() !== "",
  );
}
