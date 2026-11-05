/**
 * keepTogether no layout REAL do react-pdf (L10 T3): um grupo que ocupa a folha útil inteira,
 * no topo da folha, não pode abrir uma folha em branco antes dele (o `- 1` de KEEP_PAGE_PT
 * absorve os 0,11pt que o A4 do react-pdf, 841,89, tem a menos que o token, 842).
 */
import { describe, it, expect } from "vitest";
import { Document, Page, View, pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import { createPdfFontStore } from "@/test/pdfFontStore";
import { PAGE_MARGIN_PT } from "../pageTokens";
import { KEEP_PAGE_PT, KEEP_QUESTION_PT, keepTogether } from "./keepTogether";

type Node = { type?: string; children?: Node[] };

async function pagesOf(group: (presence: number) => unknown[], groupHeight: number): Promise<number> {
  const element = (
    <Document>
      <Page size="A4" style={{ padding: PAGE_MARGIN_PT }}>
        <View>
          {group(KEEP_PAGE_PT) as never}
          <View style={{ height: groupHeight }} />
        </View>
      </Page>
    </Document>
  );
  const inst = pdf();
  inst.updateContainer(element);
  const tree = (await layoutDocument(
    (inst as unknown as { container: { document: unknown } }).container.document,
    createPdfFontStore() as never,
  )) as Node;
  return (tree.children ?? []).filter((child) => child.type === "PAGE").length;
}

describe("keepTogether (layout real)", () => {
  it("a group as tall as the usable page, at the top of the page, stays on one page (L10 T3)", async () => {
    expect(await pagesOf(keepTogether, KEEP_PAGE_PT)).toBe(1);
  });

  it("the question keep is half a page", () => {
    expect(KEEP_QUESTION_PT).toBe(Math.floor(KEEP_PAGE_PT / 2));
  });
});
