/**
 * Cinza secundário do documento — legenda da imagem e instrução da questão
 * (achado 0307).
 *
 * O tamanho desses dois elementos já vinha de `pageTokens` (`--doc-fs-*` /
 * `elementSizes`); só a COR tinha ficado fora do pipeline de tokens: a prévia
 * herdava `text-muted-foreground` (token do chrome do app) e o PDF trazia dois
 * literais próprios, `#666666` na legenda e `#555555` na instrução. Na tela os
 * dois elementos são a mesma tinta; no papel saíam com pesos diferentes, com a
 * instrução mais escura que a legenda — hierarquia trocada justo na superfície
 * que o professor não consegue conferir antes de imprimir.
 *
 * Este teste trava o ponto único: um `INK_MUTED` só, consumido pela prévia e
 * pelo PDF.
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { AdaptationPdf } from "./pdf/AdaptationPdf";
import { ImageBlockView } from "./blocks/ImageBlockView";
import { QuestionView } from "./blocks/QuestionView";
import { INK_MUTED } from "./pageTokens";
import { renderDocument } from "./__fixtures__/renderDocument";
import type { Block } from "@/lib/adaptation/canonical/schema";
import type { PanelSettings } from "@/components/adaptation/export/panelSettings";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

const settings: PanelSettings = {
  header: { title: "Prova", school: "Escola", teacher: "Ana", date: "2026-09-23" },
  pageBreakPerQuestion: false,
};

/** Normaliza uma cor CSS para o formato em que o jsdom a devolve. */
function cssColor(value: string): string {
  const probe = document.createElement("div");
  probe.style.color = value;
  return probe.style.color;
}

type Styleish = { color?: string };

/** Cores declaradas na árvore do PDF (ignora o rodapé, que é `fixed`). */
function pdfColors(node: unknown, out: string[] = []): string[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((child) => pdfColors(child, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement;
  if ((el.props as { fixed?: boolean }).fixed === true) return out;
  const style = (el.props as { style?: unknown }).style;
  const list = Array.isArray(style) ? style : [style];
  for (const s of list) {
    if (typeof s === "object" && s !== null && typeof (s as Styleish).color === "string") {
      out.push((s as Styleish).color!);
    }
  }
  if (typeof el.type === "function") {
    pdfColors((el.type as (p: unknown) => unknown)(el.props), out);
  }
  pdfColors((el.props as { children?: unknown }).children, out);
  return out;
}

const imageBlock = {
  id: id(1),
  type: "image",
  src: "https://example.com/fig.png",
  alt: "Figura",
  caption: rt("Figura 1 - esquema largo de apoio"),
} as Extract<Block, { type: "image" }>;

const questionBlock = {
  id: id(2),
  type: "question",
  stem: [{ id: id(3), type: "paragraph", content: rt("Quanto é 1/2 + 1/4?") }],
  instruction: rt("Marque a alternativa correta."),
  answer: { kind: "open", answerLines: 2 },
} as Extract<Block, { type: "question" }>;

describe("cinza secundário do documento (achado 0307)", () => {
  it("o PDF não carrega cinza literal fora dos tokens de página", () => {
    const colors = pdfColors(AdaptationPdf({ document: renderDocument, settings }));

    expect(colors.length).toBeGreaterThan(0);
    expect(colors.filter((c) => c === "#666666" || c === "#555555")).toEqual([]);
    expect(colors).toContain(INK_MUTED);
  });

  it("a legenda da prévia usa o token, não o cinza do chrome do app", () => {
    render(<ImageBlockView block={imageBlock} />);
    const caption = screen.getByText("Figura 1 - esquema largo de apoio").closest("figcaption")!;

    expect(caption.className).not.toContain("text-muted-foreground");
    expect(caption.style.color).toBe(cssColor(INK_MUTED));
  });

  it("a instrução da prévia usa o mesmo token da legenda", () => {
    render(<QuestionView block={questionBlock} number={1} />);
    const instruction = screen.getByTestId("question-instruction");

    expect(instruction.className).not.toContain("text-muted-foreground");
    expect(instruction.style.color).toBe(cssColor(INK_MUTED));
  });
});
