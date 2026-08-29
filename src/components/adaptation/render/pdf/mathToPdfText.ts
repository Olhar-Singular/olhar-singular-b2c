/**
 * Math → PDF text projection (v1, pragmatic).
 *
 * react-pdf cannot render KaTeX HTML/MathML, so for v1 we render block and
 * inline math as their raw LaTeX source in a distinct monospace style. The math
 * node mapper is kept isolated (this helper + PdfMath) so it can be swapped for
 * a high-fidelity renderer later without touching the rest of the PDF mappers.
 *
 * TODO(resolution): high-fidelity math via KaTeX→PNG rasterization or Puppeteer
 * (spec upgrade path). Do NOT pull in html2canvas/puppeteer now.
 */

import { MATH_PDF_FONT_SIZE_PT } from "../pageTokens";

/** Return the LaTeX source to display for a math node in the PDF. */
export function mathToPdfText(latex: string): string {
  return latex;
}

/**
 * Shared monospace style for math LaTeX text in the PDF.
 *
 * O tamanho não é escolhido aqui: vem de `MATH_PDF_FONT_SIZE_PT`, a razão de
 * tinta publicada em `pageTokens` já compensada pela caixa alta da Courier. Era
 * um `11` literal, que com a métrica desta família dava 0,74x a tinta do corpo
 * enquanto a folha do Revisar mostrava 1,12x — a proporção invertia entre a tela
 * e o papel (achado 0424).
 */
export const MATH_PDF_STYLE = {
  fontFamily: "Courier",
  fontSize: MATH_PDF_FONT_SIZE_PT,
} as const;
