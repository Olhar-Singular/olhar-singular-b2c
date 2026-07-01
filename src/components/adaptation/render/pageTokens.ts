/**
 * pageTokens — fonte única dos valores-base da PÁGINA, compartilhada entre o
 * PDF (@react-pdf, em pt) e a folha da tela (CSS, em px). Mexer aqui move as
 * duas superfícies juntas: é o contrato de paridade do design (§3.1).
 *
 * Desde a Fase 4a as funções aceitam um `ResolvedPageStyle` (fonte/tamanho/
 * espaçamento do documento, vindo do popover Aparência). Chamar sem argumento
 * devolve os defaults atuais — paridade preservada para docs sem `pageStyle`.
 */
import type { CSSProperties } from "react";
import type { ResolvedPageStyle } from "./pageStyle";
import { fontFamilyToCss, fontFamilyToPdf } from "@/lib/adaptation/canonical/fontFamily";

/** Margem da página A4, em pontos (1pt = 1/72in) — igual ao PDF atual. */
export const PAGE_MARGIN_PT = 40;
/** Tamanho de fonte base, em pontos. */
export const BASE_FONT_PT = 12;
/** Entrelinha base (multiplicador). */
export const BASE_LINE_HEIGHT = 1.4;
/** Espaçamento default entre blocos top-level, em px (≈ `1rem` do CSS atual). */
export const BASE_BLOCK_SPACING_PX = 16;

/**
 * Largura default (px, unidade da tela) de uma imagem SEM `width` explícito.
 * Contrato de paridade das imagens: o resizer do editor, a prévia da exportação
 * e o PDF caem todos neste valor quando a imagem não foi redimensionada — assim
 * o tamanho que o usuário vê editando é o tamanho que sai no PDF. Sem ele, o
 * react-pdf estica uma imagem sem largura por toda a caixa de conteúdo (a folha
 * mostra o natural / o editor mostra 300px), e os tamanhos divergem.
 */
export const DEFAULT_IMAGE_WIDTH_PX = 300;

/**
 * Defaults resolvidos usados quando nenhum `pageStyle` é passado. Definido aqui
 * (a partir das constantes-base) em vez de importado de `pageStyle.ts` para
 * evitar um ciclo de import em tempo de avaliação (pageStyle importa as
 * constantes-base deste módulo).
 */
const DEFAULT_RESOLVED: ResolvedPageStyle = {
  fontFamily: undefined,
  fontSize: BASE_FONT_PT,
  blockSpacing: BASE_BLOCK_SPACING_PX,
};

/** pt -> px na tela (CSS px = pt * 96/72). */
const PT_TO_PX = 96 / 72;
const px = (pt: number) => `${Math.round(pt * PT_TO_PX * 100) / 100}px`;

/** Estilo base do <Page> do react-pdf (em pt). */
export function pageTokensToPdf(resolved: ResolvedPageStyle = DEFAULT_RESOLVED) {
  return {
    flexDirection: "column" as const,
    padding: PAGE_MARGIN_PT,
    fontSize: resolved.fontSize,
    lineHeight: BASE_LINE_HEIGHT,
    ...(resolved.fontFamily ? { fontFamily: fontFamilyToPdf(resolved.fontFamily) } : {}),
  };
}

/** Estilo base da folha da tela (em px). Expõe `--doc-block-spacing` e vars por elemento. */
export function pageTokensToCss(resolved: ResolvedPageStyle = DEFAULT_RESOLVED): CSSProperties {
  const efs = resolved.elementFontSizes;
  return {
    padding: px(PAGE_MARGIN_PT),
    fontSize: px(resolved.fontSize),
    lineHeight: BASE_LINE_HEIGHT,
    ...(resolved.fontFamily ? { fontFamily: fontFamilyToCss(resolved.fontFamily) } : {}),
    ["--doc-block-spacing"]: `${resolved.blockSpacing}px`,
    ...(efs?.stem !== undefined ? { ["--doc-fs-stem"]: px(efs.stem) } : {}),
    ...(efs?.instruction !== undefined ? { ["--doc-fs-instruction"]: px(efs.instruction) } : {}),
    ...(efs?.alternative !== undefined ? { ["--doc-fs-alternative"]: px(efs.alternative) } : {}),
    ...(efs?.caption !== undefined ? { ["--doc-fs-caption"]: px(efs.caption) } : {}),
  } as CSSProperties;
}
