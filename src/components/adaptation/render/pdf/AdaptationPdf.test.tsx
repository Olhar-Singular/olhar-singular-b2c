import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { Document, Page, Text, View, Image } from "@react-pdf/renderer";
import { AdaptationPdf, PdfHeader } from "./AdaptationPdf";
import { PdfBlock } from "./PdfBlock";
import { PdfHeading, PdfParagraph, PdfImage, PdfScaffolding, PdfDivider } from "./PdfLeafBlocks";
import { PdfMath } from "./PdfMath";
import { PdfQuestion } from "./PdfQuestion";
import { PdfAnswer } from "./PdfAnswer";
import { renderDocument } from "../__fixtures__/renderDocument";
import type { Block, CanonicalDocument, QuestionAnswer } from "@/lib/adaptation/canonical/schema";
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
  fontFamily: "Helvetica",
  pageBreakPerQuestion: false,
};

describe("AdaptationPdf", () => {
  it("wraps the document in <Document><Page>", () => {
    const el = AdaptationPdf({ document: renderDocument });
    expect(isValidElement(el)).toBe(true);
    expect(el.type).toBe(Document);
    expect(el.props.children.type).toBe(Page);
  });

  it("applies the base font family from settings", () => {
    const el = AdaptationPdf({ document: renderDocument, settings: { ...settings, fontFamily: "Courier" } });
    expect(el.props.children.props.style.fontFamily).toBe("Courier");
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
    expect(text).toContain("2026-06-04");
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
