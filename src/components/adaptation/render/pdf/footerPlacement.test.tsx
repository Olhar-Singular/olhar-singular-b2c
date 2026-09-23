/**
 * Onde o rodapé fixo é PINTADO (achado 0170).
 *
 * `AdaptationPdf.test.tsx` prova que o `<Text fixed render>` existe na árvore e
 * que a string está certa; nenhum teste provava que ele cai DENTRO do papel. E
 * não caía: o `@react-pdf` mede um `<Text>` com `render` como se o conteúdo
 * ocupasse centenas de linhas (a função só roda na hora de pintar, então a
 * medida sai da caixa sem restrição de altura), e o `bottom` do elemento
 * absoluto passa a resolver contra essa altura fantasma — o rodapé ia parar a
 * ~7.777 pt ABAIXO de uma página de 841,89 pt. Como sai fora do box de toda
 * página, o `fixed` também não repetia: o run aparecia uma vez só, invisível.
 *
 * O oráculo aqui é a caixa computada pelo layout REAL do react-pdf (o mesmo
 * caminho de `imageOverflow.test.tsx`), não `pdftotext` — que descarta texto
 * fora do MediaBox e por isso lia "o rodapé não foi emitido" (diagnóstico da
 * ficha `0120`) quando o problema era de posicionamento.
 */

import { describe, it, expect } from "vitest";
import { pdf } from "@react-pdf/renderer";
import layoutDocument from "@react-pdf/layout";
import FontStore from "@react-pdf/font";
import { AdaptationPdf } from "./AdaptationPdf";
import { PAGE_HEIGHT_PT } from "../pageTokens";
import { FOOTER_BOTTOM_PT, FOOTER_LINE_HEIGHT_PT } from "../footerLabel";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings } from "@/components/adaptation/export/panelSettings";

type Box = { top: number; height: number };
type LayoutNode = {
  type?: string;
  box?: Box;
  style?: { position?: string };
  props?: { fixed?: boolean };
  children?: LayoutNode[];
};

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;

/** Documento longo o bastante para paginar — o rodapé tem que repetir. */
const longDocument: CanonicalDocument = {
  schemaVersion: 1,
  blocks: Array.from({ length: 60 }, (_, i) => ({
    id: id(i + 1),
    type: "paragraph" as const,
    content: [{ type: "text" as const, text: `Linha ${i + 1} do enunciado da atividade.` }],
  })),
};

const settings: PanelSettings = {
  header: { title: "Prova de Ciências", school: "EM Ana Ribeiro", teacher: "Ana", date: "2026-08-17" },
  pageBreakPerQuestion: false,
};

/** Caixas computadas de todo nó absoluto/`fixed` — o rodapé é o único. */
function footerBoxes(node: LayoutNode | undefined, out: Box[] = []): Box[] {
  if (!node || typeof node !== "object") return out;
  const isFooter = node.props?.fixed === true || node.style?.position === "absolute";
  if (isFooter && node.box) out.push(node.box);
  (node.children ?? []).forEach((child) => footerBoxes(child, out));
  return out;
}

async function layoutFooters(): Promise<Box[]> {
  const inst = pdf();
  inst.updateContainer(AdaptationPdf({ document: longDocument, settings }));
  const layout = await layoutDocument(
    (inst as unknown as { container: { document: LayoutNode } }).container.document,
    new (FontStore as unknown as { new (): unknown })() as never,
  );
  const boxes = footerBoxes(layout);
  if (boxes.length === 0) throw new Error("no fixed footer box in computed layout");
  return boxes;
}

describe("PdfPageFooter — o rodapé é pintado dentro do papel", () => {
  it("põe o rodapé de TODA página dentro dos 841,89 pt da folha", async () => {
    const boxes = await layoutFooters();
    // Mais de uma página: o `fixed` só repete se a caixa couber na página.
    expect(boxes.length).toBeGreaterThan(1);
    for (const box of boxes) {
      expect(box.top).toBeGreaterThanOrEqual(0);
      expect(box.top + box.height).toBeLessThanOrEqual(PAGE_HEIGHT_PT);
    }
  });

  it("apoia o rodapé a FOOTER_BOTTOM_PT da base, com a altura de uma linha", async () => {
    const boxes = await layoutFooters();
    for (const box of boxes) {
      // Sem a altura travada, a caixa fantasma do `render` mede milhares de pt
      // e o `bottom` resolve contra ela: é o que empurrava o rodapé para fora.
      expect(box.height).toBeCloseTo(FOOTER_LINE_HEIGHT_PT, 1);
      expect(box.top + box.height).toBeCloseTo(PAGE_HEIGHT_PT - FOOTER_BOTTOM_PT, 0);
    }
  });
});
