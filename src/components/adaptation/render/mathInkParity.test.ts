/**
 * Contrato da RAZÃO DE TINTA DA FÓRMULA contra o corpo (achado 0424).
 *
 * Na mesma frase, a fórmula era desenhada MAIOR que o texto ao redor na folha do
 * Revisar (1,12x de altura de tinta) e MENOR no PDF (0,74x): a proporção invertia
 * de lado entre a tela em que o professor confere a prova e o papel que chega ao
 * aluno. Eram duas decisões independentes e nenhuma delas do produto — na tela, o
 * `1.21em` default da folha de estilo do KaTeX; no papel, um `fontSize: 11` fixo
 * numa família (Courier) cuja caixa alta é bem mais baixa que a do corpo.
 *
 * A razão passa a ser UM número publicado (`MATH_INK_RATIO`), e cada superfície
 * converte esse número para o seu tamanho de fonte pela caixa alta da família que
 * ela usa. Comparar tamanho de fonte entre famílias diferentes não diz nada: o que
 * o professor enxerga é altura de tinta, e é ela que este teste amarra.
 */

import { describe, it, expect } from "vitest";
import {
  BASE_FONT_PT,
  CAP_HEIGHT_EM,
  MATH_FONT_SIZE_EM,
  MATH_INK_RATIO,
  pageTokensToCss,
} from "./pageTokens";
import { MATH_PDF_STYLE } from "./pdf/mathToPdfText";

/** Altura de tinta de uma caixa alta: tamanho da fonte x caixa alta da família. */
const ink = (fontSize: number, capHeightEm: number) => fontSize * capHeightEm;

describe("razão de tinta da fórmula contra o corpo (0424)", () => {
  it("a folha do Revisar desenha a fórmula na razão publicada", () => {
    const body = ink(1, CAP_HEIGHT_EM.body);
    const math = ink(MATH_FONT_SIZE_EM, CAP_HEIGHT_EM.mathScreen);
    expect(math / body).toBeCloseTo(MATH_INK_RATIO, 2);
  });

  it("o PDF desenha a fórmula na MESMA razão, compensada pela métrica da Courier", () => {
    const body = ink(BASE_FONT_PT, CAP_HEIGHT_EM.body);
    const math = ink(MATH_PDF_STYLE.fontSize, CAP_HEIGHT_EM.mathPdf);
    expect(math / body).toBeCloseTo(MATH_INK_RATIO, 2);
  });

  it("a folha publica o tamanho da fórmula como token de página (`--doc-fs-math`)", () => {
    const css = pageTokensToCss() as Record<string, string>;
    expect(css["--doc-fs-math"]).toBe(`${MATH_FONT_SIZE_EM}em`);
  });
});
