/**
 * PanelSettings — user-facing export options held by the ExportPanel and passed
 * to the PDF builder: an optional header (title/school/teacher/date), a base
 * font family for the document, and a global page-break-per-question toggle.
 */

/** The three built-in react-pdf fonts (no Font.register needed). */
export const PDF_FONTS = ["Helvetica", "Times-Roman", "Courier"] as const;
export type PdfFont = (typeof PDF_FONTS)[number];

export type HeaderSettings = {
  title?: string;
  school?: string;
  teacher?: string;
  date?: string;
};

export type PanelSettings = {
  header: HeaderSettings;
  fontFamily: PdfFont;
  pageBreakPerQuestion: boolean;
};

export const DEFAULT_PANEL_SETTINGS: PanelSettings = {
  header: {},
  fontFamily: "Helvetica",
  pageBreakPerQuestion: false,
};

/** True when at least one header field has non-empty content. */
export function hasHeaderContent(header: HeaderSettings): boolean {
  return [header.title, header.school, header.teacher, header.date].some(
    (v) => v !== undefined && v.trim() !== "",
  );
}
