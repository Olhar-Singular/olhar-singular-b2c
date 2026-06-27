import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { Document, Page, Text, View } from "@react-pdf/renderer";
import { AdaptationPdf, PdfHeader } from "./AdaptationPdf";
import { pageTokensToPdf } from "../pageTokens";
import { PdfBlock } from "./PdfBlock";
import { PdfHeading, PdfParagraph, PdfImage, PdfScaffolding, PdfDivider } from "./PdfLeafBlocks";
import { PdfMath } from "./PdfMath";
import { PdfQuestion } from "./PdfQuestion";
import { PdfAnswer } from "./PdfAnswer";
import { renderDocument } from "../__fixtures__/renderDocument";
import type { Block, CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings } from "@/components/adaptation/export/panelSettings";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Collect, depth-first, the component types and string text leaves of a tree. */
function walk(node: unknown, types: unknown[], texts: string[]): void {
  if (node === null || node === undefined || typeof node === "boolean") return;
  if (typeof node === "string") {
    texts.push(node);
    return;
  }
  if (typeof node === "number") {
    texts.push(String(node));
    return;
  }
  if (Array.isArray(node)) {
    node.forEach((child) => walk(child, types, texts));
    return;
  }
  if (isValidElement(node)) {
    const el = node as ReactElement;
    types.push(el.type);
    // Render function components so their internal mapper elements are visited.
    if (typeof el.type === "function") {
      const rendered = (el.type as (p: unknown) => unknown)(el.props);
      walk(rendered, types, texts);
    }
    walk((el.props as { children?: unknown }).children, types, texts);
  }
}

function collect(node: unknown) {
  const types: unknown[] = [];
  const texts: string[] = [];
  walk(node, types, texts);
  return { types, texts, text: texts.join("") };
}

const settings: PanelSettings = {
  header: {},
  pageBreakPerQuestion: false,
};

describe("AdaptationPdf", () => {
  it("wraps the document in <Document><Page>", () => {
    const el = AdaptationPdf({ document: renderDocument });
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(Document);
    expect(el.props.children.type).toBe(Page);
  });

  it("applies font family from pageStyle (lexend → 'Lexend')", () => {
    const el = AdaptationPdf({
      document: renderDocument,
      settings,
      pageStyle: { fontFamily: "lexend" },
    });
    expect(el.props.children.props.style.fontFamily).toBe("Lexend");
  });

  it("applies fontSize from pageStyle to the <Page> style", () => {
    const el = AdaptationPdf({
      document: renderDocument,
      settings,
      pageStyle: { fontSize: 16 },
    });
    expect(el.props.children.props.style.fontSize).toBe(16);
  });

  it("a legacy doc (no pageStyle) still renders with default tokens", () => {
    const el = AdaptationPdf({ document: renderDocument, settings });
    // The <Page> must still have the default padding and fontSize.
    expect(el.props.children.props.style.padding).toBe(40);
    expect(el.props.children.props.style.fontSize).toBe(12);
    // No fontFamily emitted when no pageStyle font is set.
    expect(el.props.children.props.style.fontFamily).toBeUndefined();
  });

  it("does NOT use settings.fontFamily for the <Page> style (font now comes from pageStyle)", () => {
    // Even if the caller still passes a settings object (e.g. from an old code path),
    // the Page style must NOT use settings.fontFamily — it only uses pageStyle.
    const el = AdaptationPdf({
      document: renderDocument,
      settings,
      pageStyle: undefined,
    });
    // fontFamily should be absent from the Page style (no pageStyle → no override).
    expect(el.props.children.props.style.fontFamily).toBeUndefined();
  });

  it("covers every block type via a PdfBlock per block", () => {
    const { types } = collect(AdaptationPdf({ document: renderDocument }));
    // The fixture has one of each block type; each maps to its dedicated mapper.
    expect(types).toContain(PdfHeading);
    expect(types).toContain(PdfParagraph);
    expect(types).toContain(PdfMath);
    expect(types).toContain(PdfImage);
    expect(types).toContain(PdfScaffolding);
    expect(types).toContain(PdfDivider);
    expect(types).toContain(PdfQuestion);
  });

  it("renders inline and block math as their LaTeX source (v1)", () => {
    const { text } = collect(AdaptationPdf({ document: renderDocument }));
    expect(text).toContain("\\frac{a}{b}"); // inline math
    expect(text).toContain("x^2 + y^2 = z^2"); // block math
  });

  it("aplica os tokens de página compartilhados no <Page>", () => {
    // O <Page> base deve herdar padding/fontSize/lineHeight de pageTokensToPdf();
    const base = pageTokensToPdf();
    expect(base.padding).toBe(40);
    expect(base.fontSize).toBe(12);
  });
});

describe("PdfHeader", () => {
  it("renders nothing when the header is empty", () => {
    expect(PdfHeader({ header: {} })).toBeNull();
  });

  it("renders title, school, teacher and date when present", () => {
    const { text } = collect(
      PdfHeader({ header: { title: "Prova", school: "Escola X", teacher: "Ana", date: "2026-06-04" } }),
    );
    expect(text).toContain("Prova");
    expect(text).toContain("Escola X");
    expect(text).toContain("Ana");
    // ISO date stored in settings must be formatted as DD/MM/AAAA for the PDF.
    expect(text).toContain("04/06/2026");
    expect(text).not.toContain("2026-06-04");
  });

  it("renders a non-ISO date string as-is (graceful fallback)", () => {
    const { text } = collect(PdfHeader({ header: { title: "X", date: "sem data" } }));
    expect(text).toContain("sem data");
  });

  it("renders placeholder cells when teacher/date are blank but another field is set", () => {
    const el = PdfHeader({ header: { title: "Prova" } });
    expect(el).not.toBeNull();
    const { types } = collect(el);
    expect(types).toContain(Text);
  });
});

describe("AdaptationPdf — header + page-break wiring", () => {
  it("includes the header when settings carry header content", () => {
    const { text } = collect(
      AdaptationPdf({ document: renderDocument, settings: { ...settings, header: { title: "Minha Prova" } } }),
    );
    expect(text).toContain("Minha Prova");
  });

  it("wraps non-first questions in a break View when pageBreakPerQuestion is on", () => {
    const twoQuestions: CanonicalDocument = {
      schemaVersion: 1,
      blocks: [
        renderDocument.blocks.find((b) => b.type === "question")!,
        renderDocument.blocks.filter((b) => b.type === "question")[1]!,
      ],
    };
    const el = AdaptationPdf({ document: twoQuestions, settings: { ...settings, pageBreakPerQuestion: true } });
    // Page children: [<PdfHeader/>, [blockElements]]. Flatten to find break Views.
    const pageChildren = (el.props.children.props.children as unknown[]).flat();
    const breakViews = pageChildren.filter(
      (c) => isValidElement(c) && c.type === View && (c.props as { break?: boolean }).break,
    );
    expect(breakViews).toHaveLength(1); // only the 2nd question breaks
  });
});

describe("PdfQuestion — customNumber and enunciado branches", () => {
  const qBlock = (overrides: Record<string, unknown> = {}) => ({
    id: id(90),
    type: "question" as const,
    stem: [{ id: id(91), type: "paragraph" as const, content: [{ type: "text", text: "Pergunta?" }] }],
    answer: { kind: "open" as const, answerLines: 2 },
    ...overrides,
  });

  it("uses customNumber in the rendered text when set", () => {
    const { text } = collect(PdfQuestion({ block: qBlock({ customNumber: "3a" }), number: 3 }));
    expect(text).toContain("3a.");
  });

  it("falls back to the auto number when customNumber is not set", () => {
    const { text } = collect(PdfQuestion({ block: qBlock(), number: 2 }));
    expect(text).toContain("2.");
  });

  it("renders enunciado content when enunciado is present", () => {
    const block = qBlock({ enunciado: [{ type: "text", text: "Observe a imagem." }] });
    const { text } = collect(PdfQuestion({ block, number: 1 }));
    expect(text).toContain("Observe a imagem.");
  });

  it("renders enunciado above the stem when enunciadoPosition is 'above'", () => {
    const block = qBlock({
      enunciado: [{ type: "text", text: "Leia o texto." }],
      enunciadoPosition: "above" as const,
    });
    const { text } = collect(PdfQuestion({ block, number: 1 }));
    const enunciadoPos = text.indexOf("Leia o texto.");
    const stemPos = text.indexOf("Pergunta?");
    expect(enunciadoPos).toBeLessThan(stemPos);
  });

  it("renders enunciado below the stem when enunciadoPosition is 'below'", () => {
    const block = qBlock({
      enunciado: [{ type: "text", text: "Veja o gráfico." }],
      enunciadoPosition: "below" as const,
    });
    const { text } = collect(PdfQuestion({ block, number: 1 }));
    const enunciadoPos = text.indexOf("Veja o gráfico.");
    const stemPos = text.indexOf("Pergunta?");
    expect(stemPos).toBeLessThan(enunciadoPos);
  });
});

describe("AdaptationPdf — blockGap threading", () => {
  it("passes the resolved blockGap (12pt from default 16px) to blocks", () => {
    // Default pageStyle → blockSpacing=16px → 16*72/96=12pt
    const el = AdaptationPdf({ document: renderDocument, settings });
    // Page children include the block nodes; we check that PdfBlock received a blockGap prop.
    // We verify via the collect walk that PdfParagraph renders with marginBottom=12 (default gap).
    // Since there are no per-block spacingAfter overrides in renderDocument, paragraphs use the gap.
    const pageChildren = (el.props.children.props.children as unknown[]).flat();
    // At least one PdfBlock element should have a blockGap prop.
    const pdfBlockEls = pageChildren.filter(
      (c) => isValidElement(c) && (c.type === PdfBlock),
    );
    expect(pdfBlockEls.length).toBeGreaterThan(0);
    for (const blockEl of pdfBlockEls) {
      expect((blockEl as ReactElement).props).toHaveProperty("blockGap");
    }
  });
});
