/**
 * Tamanho do TÍTULO sob o controle "Tamanho do texto" (achado 0412).
 *
 * Enunciado, instrução, alternativa e legenda já saem de `pageStyle.fontSize`
 * pelo resolvedor único (`resolveElementFontSizes` / `--doc-fs-*`); o título
 * era a única família ainda escrita à mão uma vez por superfície — `1.5rem` no
 * CSS da folha, `text-2xl` na prévia do Exportar e `HEADING_PT` no PDF. Como só
 * o denominador se movia, subir o corpo para 28px (o teto do popover) deixava o
 * título MENOR que o texto que ele encabeça nas três superfícies ao mesmo
 * tempo, justamente para quem adapta por baixa visão.
 *
 * Este teste trava o ponto único: um ratio por nível sobre o corpo do
 * documento, consumido pelas três superfícies.
 */

import { describe, it, expect } from "vitest";
import { isValidElement, type ReactElement } from "react";
import { render, screen } from "@testing-library/react";
import { AdaptationPdf } from "./pdf/AdaptationPdf";
import { HeadingBlockView } from "./blocks/HeadingBlockView";
import { pageTokensToCss, resolveElementFontSizes, BASE_FONT_PT, HEADING_PT } from "./pageTokens";
import { resolvePageStyle } from "./pageStyle";
import type { CanonicalDocument, Block } from "@/lib/adaptation/canonical/schema";

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, "0")}`;
const rt = (t: string) => [{ type: "text" as const, text: t }];

const heading = (level: 1 | 2 | 3, n: number) =>
  ({ id: id(n), type: "heading", level, content: rt(`Título ${level}`) }) as Extract<
    Block,
    { type: "heading" }
  >;

const doc: CanonicalDocument = {
  schemaVersion: 1,
  blocks: [heading(1, 1), heading(2, 2), heading(3, 3)],
};

/** Todos os `fontSize` declarados na árvore do PDF (ignora o rodapé `fixed`). */
function pdfFontSizes(node: unknown, out: number[] = []): number[] {
  if (node === null || node === undefined || typeof node !== "object") return out;
  if (Array.isArray(node)) {
    node.forEach((child) => pdfFontSizes(child, out));
    return out;
  }
  if (!isValidElement(node)) return out;
  const el = node as ReactElement;
  if ((el.props as { fixed?: boolean }).fixed === true) return out;
  const style = (el.props as { style?: unknown }).style;
  for (const s of Array.isArray(style) ? style : [style]) {
    if (typeof s === "object" && s !== null && typeof (s as { fontSize?: number }).fontSize === "number") {
      out.push((s as { fontSize: number }).fontSize);
    }
  }
  if (typeof el.type === "function") {
    pdfFontSizes((el.type as (p: unknown) => unknown)(el.props), out);
  }
  pdfFontSizes((el.props as { children?: unknown }).children, out);
  return out;
}

describe("tamanho do título segue o corpo do documento (achado 0412)", () => {
  it("o resolvedor devolve o título por nível na proporção do corpo", () => {
    const base = resolveElementFontSizes(resolvePageStyle());
    expect(base.heading1).toBeCloseTo(HEADING_PT[1], 5);
    expect(base.heading2).toBeCloseTo(HEADING_PT[2], 5);
    expect(base.heading3).toBeCloseTo(HEADING_PT[3], 5);

    const dobro = resolveElementFontSizes(resolvePageStyle({ fontSize: BASE_FONT_PT * 2 }));
    expect(dobro.heading1).toBeCloseTo(HEADING_PT[1] * 2, 5);
    expect(dobro.heading2).toBeCloseTo(HEADING_PT[2] * 2, 5);
    expect(dobro.heading3).toBeCloseTo(HEADING_PT[3] * 2, 5);
  });

  it("a folha publica --doc-fs-heading* e ela escala com o corpo", () => {
    const padrao = pageTokensToCss(resolvePageStyle()) as Record<string, unknown>;
    expect(padrao["--doc-fs-heading1"]).toBe("24px"); // 18pt
    expect(padrao["--doc-fs-heading2"]).toBe("20px"); // 15pt
    expect(padrao["--doc-fs-heading3"]).toBe("18px"); // 13.5pt

    // 21pt de corpo (28px, o teto do popover Formato).
    const grande = pageTokensToCss(resolvePageStyle({ fontSize: 21 })) as Record<string, unknown>;
    expect(grande["--doc-fs-heading1"]).toBe("42px"); // 31.5pt — maior que o corpo
  });

  it("a prévia do Exportar dimensiona o título pelo token, não por classe fixa", () => {
    render(<HeadingBlockView block={heading(1, 1)} />);
    const h1 = screen.getByText("Título 1").closest("h1")!;

    expect(h1.className).not.toContain("text-2xl");
    expect(h1.getAttribute("style")).toContain("--doc-fs-heading1");
  });

  it("o PDF imprime o título no mesmo tamanho que a folha publica", () => {
    const sizes = pdfFontSizes(AdaptationPdf({ document: doc, pageStyle: { fontSize: 21 } }));

    expect(sizes).toContain(31.5); // h1: 21 * 1.5
    expect(sizes).toContain(26.25); // h2: 21 * 1.25
    expect(sizes).toContain(23.625); // h3: 21 * 1.125
    expect(sizes).not.toContain(HEADING_PT[1]);
  });
});
