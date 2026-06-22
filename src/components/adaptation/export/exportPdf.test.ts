import { describe, it, expect, vi } from "vitest";
import { isValidElement } from "react";
import { buildPdfDocument, pdfFileName } from "./exportPdf";
import { AdaptationPdf } from "@/components/adaptation/render/pdf/AdaptationPdf";
import { DEFAULT_PANEL_SETTINGS } from "./panelSettings";
import type { CanonicalDocument, PageStyle } from "@/lib/adaptation/canonical/schema";

// registerPdfFonts is called inside buildPdfDocument; mock it so tests don't
// touch @react-pdf/renderer's Font.register in the unit test environment.
vi.mock("@/components/adaptation/render/pdf/registerFonts", () => ({
  registerPdfFonts: vi.fn(),
}));

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [{ id: id(1), type: "paragraph", content: [{ type: "text", text: "oi" }] }],
};

describe("buildPdfDocument", () => {
  it("returns an AdaptationPdf element with the document and settings", () => {
    const el = buildPdfDocument(doc, DEFAULT_PANEL_SETTINGS);
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(AdaptationPdf);
    expect(el.props.document).toBe(doc);
    expect(el.props.settings).toBe(DEFAULT_PANEL_SETTINGS);
  });

  it("defaults the settings when omitted", () => {
    const el = buildPdfDocument(doc);
    expect(el.props.settings).toBe(DEFAULT_PANEL_SETTINGS);
  });

  it("passes pageStyle to AdaptationPdf when provided", () => {
    const pageStyle: PageStyle = { fontFamily: "lexend", fontSize: 14 };
    const el = buildPdfDocument(doc, DEFAULT_PANEL_SETTINGS, pageStyle);
    expect(el.props.pageStyle).toBe(pageStyle);
  });

  it("passes undefined pageStyle when omitted", () => {
    const el = buildPdfDocument(doc, DEFAULT_PANEL_SETTINGS);
    expect(el.props.pageStyle).toBeUndefined();
  });
});

describe("pdfFileName", () => {
  it("falls back to a default when no title", () => {
    expect(pdfFileName()).toBe("atividade-adaptada.pdf");
    expect(pdfFileName({ ...DEFAULT_PANEL_SETTINGS, header: { title: "   " } })).toBe(
      "atividade-adaptada.pdf",
    );
  });

  it("slugifies the header title (lowercase, ascii, hyphenated)", () => {
    expect(
      pdfFileName({ ...DEFAULT_PANEL_SETTINGS, header: { title: "Atividade de Frações!" } }),
    ).toBe("atividade-de-fracoes.pdf");
  });

  it("falls back when the title slugifies to empty", () => {
    expect(pdfFileName({ ...DEFAULT_PANEL_SETTINGS, header: { title: "!!!" } })).toBe(
      "atividade-adaptada.pdf",
    );
  });
});
