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
  const parts = [header.title, header.school]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "");
  parts.push(`Página ${pageNumber} de ${totalPages}`);
  return parts.join(" · ");
}
