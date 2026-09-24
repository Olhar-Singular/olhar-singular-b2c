/**
 * Rodapé de página — texto e medida, compartilhados pelas DUAS superfícies.
 *
 * O rodapé nasceu no react-pdf (achado 0119) e ficou só lá: a prévia do
 * Exportar desenhava o pé da folha em branco enquanto TODO PDF gerado saía com
 * "Página N de M" (achado 0242). Estas constantes moram fora do
 * `AdaptationPdf.tsx` porque a tela não pode importar `@react-pdf/renderer` só
 * para saber o texto do próprio rodapé — `AdaptationPdf` as reexporta para
 * quem já as consumia de lá.
 */

import type { HeaderSettings } from "@/components/adaptation/export/panelSettings";
import { BASE_LINE_HEIGHT } from "./pageTokens";

/**
 * Distância (pt) entre a base da folha e o rodapé fixo. Menor que
 * `PAGE_MARGIN_PT`, então o rodapé mora DENTRO da margem inferior: ele não entra
 * no fluxo dos blocos nem empurra o conteúdo da página 1.
 */
export const FOOTER_BOTTOM_PT = 18;

/** `FOOTER_BOTTOM_PT` na unidade da tela (px = pt * 96/72). */
export const FOOTER_BOTTOM_PX = FOOTER_BOTTOM_PT * (96 / 72);

/** Corpo do rodapé em pt (PDF) — a tela converte com a mesma razão. */
export const FOOTER_FONT_SIZE_PT = 8;

/**
 * Altura de UMA linha do rodapé, em pt (corpo x entrelinha base).
 *
 * Não é enfeite de layout: é o que trava a caixa do `<Text fixed render>` no
 * PDF. O `@react-pdf` só executa a função `render` na hora de pintar, então na
 * MEDIDA o texto vira uma caixa fantasma de milhares de pontos — e o `bottom`
 * do elemento absoluto resolve contra ela, jogando o rodapé ~7.777 pt abaixo do
 * papel, fora do box de toda página (por isso o `fixed` também não repetia:
 * achado 0170, que corrige o diagnóstico do `0120`).
 */
export const FOOTER_LINE_HEIGHT_PT = FOOTER_FONT_SIZE_PT * BASE_LINE_HEIGHT;

/** Tinta do rodapé, a mesma nas duas superfícies. */
export const FOOTER_COLOR = "#555555";

/**
 * Texto do rodapé de uma página. Prova é folha solta: sem isto, a partir da
 * página 2 o papel sai sem título, sem escola e sem número (achado 0119), e
 * ninguém percebe que faltou uma folha no monte.
 *
 * Título e escola em branco são descartados para não sobrar separador solto.
 */
export function pdfFooterLabel(
  header: HeaderSettings,
  pageNumber: number,
  totalPages: number,
): string {
  return [...footerPrefixParts(header), `Página ${pageNumber} de ${totalPages}`].join(
    FOOTER_SEPARATOR,
  );
}

/** Separador entre título, escola e a numeração. */
export const FOOTER_SEPARATOR = " · ";

/**
 * Título e escola do rodapé, já sem os campos em branco (que sobrariam como
 * separador solto).
 *
 * Existe separado de `pdfFooterLabel` porque o rodapé do .docx não pode ser uma
 * string: o "Página X de Y" do Word são CAMPOS que só ele resolve ao paginar
 * (achado 0334). O prefixo, esse sim, é o mesmo texto nas três saídas — e é uma
 * regra só, não uma segunda cópia dela.
 */
export function footerPrefixParts(header: HeaderSettings): string[] {
  return [header.title, header.school]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "");
}
