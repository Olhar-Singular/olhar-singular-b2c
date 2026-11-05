/**
 * fontStack — a pilha de fontes de cada família do PDF, com a fonte de SÍMBOLOS
 * como segunda opção (achado C-01, lote 4).
 *
 * O `@react-pdf` aceita `fontFamily` como lista e escolhe, caractere a
 * caractere, a primeira fonte da pilha que TEM o glifo (`fontSubstitution` do
 * textkit → `hasGlyphForCodePoint`). Sem isso, a pilha de uma família termina na
 * Helvetica Type 1 que a biblioteca anexa sozinha, e um símbolo que a família
 * não tem vira OUTRO caractere (`≤` → `d`) ou some (`√` → nada).
 *
 * Com a pilha, a família que a professora escolheu desenha tudo o que sabe
 * desenhar (letra, número, pontuação) e a fonte de símbolos entra só onde falta,
 * seja na Liberation (que perde 24 dos 124 símbolos exigidos), na OpenDyslexic
 * (22), na Atkinson e na Lexend (mais de 110, nem o grego) ou na Courier
 * built-in da fórmula (só a CP1252).
 *
 * A fórmula (Courier) cai primeiro numa monoespaçada, para a coluna da conta
 * armada não deslocar (o avanço é 0,602 em, contra 0,600 da Courier); o `∥`, que
 * ela não tem, cai na proporcional.
 *
 * Os nomes são os de `registerFonts.ts`. Arquivo SEM componente nem efeito.
 */

import { PDF_SYMBOL_RANGES } from "./pdfSymbolRepertoire";

/** Símbolos em proporcional: texto corrido e as famílias de acessibilidade. */
export const SYMBOL_FONT_FAMILY = "DejaVu Sans";

/** Símbolos em monoespaçada: a Courier da fórmula. */
export const SYMBOL_MONO_FONT_FAMILY = "DejaVu Sans Mono";

/** A família da fórmula no PDF (built-in; ver `mathToPdfText.mathPdfStyle`). */
export const MATH_FONT_FAMILY = "Courier";

/** A pilha de uma família do PDF: ela mesma, depois a fonte de símbolos. */
export function pdfFontStack(family: string): string[] {
  if (family === MATH_FONT_FAMILY) {
    return [family, SYMBOL_MONO_FONT_FAMILY, SYMBOL_FONT_FAMILY];
  }
  return [family, SYMBOL_FONT_FAMILY];
}

/**
 * O PDF tem desenho para este code point? Sim se é ASCII imprimível (toda
 * família da pilha tem) ou se a fonte de símbolos o cobre (cmap exato em
 * `pdfSymbolRepertoire.ts`). O que sobra (dingbat `✓`, emoji, cirílico, CJK) não
 * existe em fonte nenhuma do arquivo e sai em branco ou trocado.
 *
 * Os acentos do português estão na Latin-1 e na Latin Estendida da fonte de
 * símbolos, então valem para TODA família, inclusive as de acessibilidade.
 */
export function isPdfPrintable(codePoint: number): boolean {
  if (codePoint >= 0x20 && codePoint <= 0x7e) return true;
  return PDF_SYMBOL_RANGES.some(([low, high]) => codePoint >= low && codePoint <= high);
}
