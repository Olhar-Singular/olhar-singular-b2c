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

import {
  MATH_PDF_FONT_SIZE_PT,
  MATH_PDF_INLINE_LINE_HEIGHT,
  PAGE_MARGIN_PT,
  pdfTextSize,
} from "../pageTokens";
import { latexLayoutAtom } from "../mathAtom";

/** Largura da folha A4 do `@react-pdf`, em pontos. */
const A4_WIDTH_PT = 595.28;

/** Avanço de um caractere da Courier, em `em` (a família é monoespaçada). */
const COURIER_ADVANCE_EM = 0.6;

/**
 * Quantos caracteres de fórmula cabem na coluna útil da folha.
 *
 * A conta é fechada porque a fórmula sai em Courier, monoespaçada: a coluna útil
 * (A4 menos as duas margens) dividida pelo avanço fixo de cada caractere. Acima
 * disso a fórmula não cabe em NENHUMA linha, e é aí que o textkit perde texto
 * (achado 0427), e por isso o átomo só é costurado até este teto.
 *
 * O teto mede a coluna de texto do documento. Colunas mais estreitas (alternativa
 * de múltipla escolha, caixa do andaime) continuam fora desta conta.
 */
export const MATH_PDF_MAX_ATOM_CHARS = Math.floor(
  (A4_WIDTH_PT - 2 * PAGE_MARGIN_PT) / (COURIER_ADVANCE_EM * MATH_PDF_FONT_SIZE_PT),
);

/**
 * Return the LaTeX source to display for a math node in the PDF.
 *
 * Os espaços saem inquebráveis (`latexLayoutAtom`): sem isso o textkit trata
 * cada espaço do LaTeX como ponto de quebra e parte a fórmula no meio, ao
 * contrário da caixa KaTeX da tela (achado 0425). O átomo só vale até
 * `MATH_PDF_MAX_ATOM_CHARS`: passando disso ele não caberia em linha nenhuma e o
 * textkit descartaria o excedente em silêncio (achado 0427).
 */
export function mathToPdfText(latex: string): string {
  return latexLayoutAtom(latex, MATH_PDF_MAX_ATOM_CHARS);
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
  ...pdfTextSize(MATH_PDF_FONT_SIZE_PT),
} as const;

/**
 * Estilo do run de fórmula INLINE, dentro de uma linha de texto do corpo.
 *
 * Mesma tinta do bloco (`MATH_PDF_FONT_SIZE_PT`, achado 0424), mas o avanço da
 * linha é o do CORPO: o textkit dimensiona a linha pelo run mais alto, e com a
 * razão cheia ao lado do corpo inflado da Courier o parágrafo inteiro avançava
 * 23,62 pt no papel contra 17,89 pt na folha do Revisar (achado 0430). A caixa
 * da fórmula é um átomo dentro da linha, não um segundo corpo de texto.
 */
export const MATH_PDF_INLINE_STYLE = {
  ...MATH_PDF_STYLE,
  lineHeight: MATH_PDF_INLINE_LINE_HEIGHT,
} as const;

/**
 * Alinhamento horizontal do `<Text>` da fórmula em BLOCO.
 *
 * `textAlign: "center"` no `@react-pdf` centra CADA linha do `<Text>`, não o
 * parágrafo. Enquanto a fórmula cabe numa linha só, centrar a linha e centrar o
 * bloco são a mesma coisa. Acima de `MATH_PDF_MAX_ATOM_CHARS` ela volta
 * quebrável (achado 0427) e o textkit a parte: aí o centro por linha desenha as
 * duas metades em recuos diferentes (x 44,58 e x 130,62), cada uma centrada por
 * si, enquanto a folha do Revisar mostra uma caixa única (achado 0431). Nesse
 * caso a fórmula passa a alinhar à esquerda, e as continuações começam na mesma
 * coluna — um objeto só, como um trecho de código dobrado.
 */
export function mathBlockTextAlign(latex: string): "center" | "left" {
  return latex.length > MATH_PDF_MAX_ATOM_CHARS ? "left" : "center";
}
