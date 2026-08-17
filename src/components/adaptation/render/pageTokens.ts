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
 * Cor da linha pautada da questão aberta — a pauta em que o aluno escreve.
 *
 * Ponto único das TRÊS superfícies (folha do Revisar, prévia do Exportar e PDF).
 * Antes cada uma tinha a sua: a folha herdava `--sf-line-2` (1,38:1 sobre o
 * branco), a prévia herdava `--border`, que é token do chrome do app e nem sequer
 * é cor de papel (1,33:1), e o PDF trazia `#999999` literal (2,85:1). Nenhuma
 * alcançava os 3:1 que a WCAG 1.4.11 exige de objeto gráfico, e a 1,3:1 a linha
 * simplesmente some numa impressão a laser em preto e branco.
 *
 * `#767676` é o cinza mais claro que ainda dá 4,5:1 sobre papel branco: contraste
 * de texto, não só de objeto gráfico, porque esta linha precisa aparecer depois de
 * fotocopiada.
 */
export const ANSWER_LINE_COLOR = "#767676";

/**
 * Distância entre uma pauta e a seguinte — a altura útil que sobra para o aluno
 * escrever. Ponto único das TRÊS superfícies, ao lado de `ANSWER_LINE_COLOR`.
 *
 * Antes cada superfície tinha o seu valor à mão: 18px de gap na folha do Revisar,
 * `space-y-3` (12px) na prévia do Exportar e 10pt (13,3px) de `marginBottom` no
 * PDF. O professor dimensionava a resposta olhando a folha (~5 mm no papel) e o
 * aluno recebia ~3,9 mm impressos — quase 25% menos altura de escrita por linha,
 * exatamente o encolhimento que faz a resposta não caber para quem tem disgrafia
 * ou letra grande.
 *
 * O valor que manda é o do papel, então adota-se o MAIOR dos três (o da folha do
 * Revisar, ~5 mm): reduzir seria piorar a acessibilidade do produto.
 */
export const ANSWER_LINE_GAP_PX = 18;

/**
 * Família usada quando o documento NÃO traz `pageStyle.fontFamily` — o caso
 * normal, já que nenhuma UI grava a fonte até o professor escolher uma no
 * popover "Formato".
 *
 * Antes a ausência de override significava "não emitir `fontFamily`", e cada
 * superfície caía no seu próprio default: a folha herdava a fonte do app
 * (`Plus Jakarta Sans`, `index.css`) e o `@react-pdf` caía no built-in
 * Helvetica. O mesmo documento aparecia com tipografias visivelmente diferentes
 * na tela e no papel — exatamente o que o contrato de paridade existe para
 * impedir. Agora as duas superfícies resolvem pelo MESMO token.
 *
 * O token é `sans` (Helvetica/Arial) porque preserva byte a byte o que o PDF já
 * imprimia: quem se move é a folha, que passa a mostrar o que sai no papel.
 * Trocar este default por uma fonte de acessibilidade é decisão de produto e
 * muda o PDF de todo mundo — não cabe aqui.
 */
export const DEFAULT_FONT_FAMILY_TOKEN = "sans";

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

/** `ANSWER_LINE_GAP_PX` na unidade do PDF (pt), pela mesma razão 72/96. */
export const ANSWER_LINE_GAP_PT = ANSWER_LINE_GAP_PX / PT_TO_PX;

/**
 * Tamanho de cada elemento do documento como FRAÇÃO do tamanho base.
 *
 * Os valores reproduzem as proporções que o PDF fixava em constantes no base de
 * 12pt (instrução/enunciado 10.5pt, legenda 10pt), então um documento sem
 * `elementFontSizes` explícito sai do papel exatamente como antes. O que muda é
 * serem proporções e não constantes: subir o tamanho do texto no popover
 * "Formato" — o controle de acessibilidade que mais importa aqui — escala junto.
 * Antes a folha crescia e a instrução impressa continuava miúda.
 */
export const ELEMENT_FONT_RATIOS = {
  stem: 1,
  instruction: 10.5 / BASE_FONT_PT,
  alternative: 1,
  caption: 10 / BASE_FONT_PT,
} as const;

/** Tamanhos por elemento já resolvidos, em pt. Toda chave presente (sem buracos). */
export type ElementFontSizesPt = { [K in keyof typeof ELEMENT_FONT_RATIOS]: number };

/**
 * Resolve os tamanhos por elemento (pt) de um documento.
 *
 * UM resolvedor alimenta as três superfícies — a folha do editor (via CSS vars
 * `--doc-fs-*`), o renderer read-only e o PDF —, então a paridade vem por
 * construção, não de três conjuntos de constantes que alguém precisa manter
 * iguais. Um `pageStyle.elementFontSizes` explícito sobrescreve POR CHAVE; as
 * chaves ausentes continuam seguindo o tamanho base.
 */
export function resolveElementFontSizes(resolved: ResolvedPageStyle): ElementFontSizesPt {
  const overrides = resolved.elementFontSizes;
  const derive = (key: keyof typeof ELEMENT_FONT_RATIOS) =>
    overrides?.[key] ?? resolved.fontSize * ELEMENT_FONT_RATIOS[key];
  return {
    stem: derive("stem"),
    instruction: derive("instruction"),
    alternative: derive("alternative"),
    caption: derive("caption"),
  };
}

/** Estilo base do <Page> do react-pdf (em pt). */
export function pageTokensToPdf(resolved: ResolvedPageStyle = DEFAULT_RESOLVED) {
  return {
    flexDirection: "column" as const,
    padding: PAGE_MARGIN_PT,
    fontSize: resolved.fontSize,
    lineHeight: BASE_LINE_HEIGHT,
    fontFamily: fontFamilyToPdf(resolved.fontFamily ?? DEFAULT_FONT_FAMILY_TOKEN),
  };
}

/**
 * Estilo base da folha da tela (em px). Expõe `--doc-block-spacing` e as vars por
 * elemento.
 *
 * As `--doc-fs-*` são emitidas SEMPRE, resolvidas por `resolveElementFontSizes`
 * (proporção do tamanho base, ou o override explícito do documento). Antes só
 * apareciam quando o documento trazia `elementFontSizes` — que nenhuma UI
 * escreve —, então a folha caía nos fallbacks do CSS enquanto o PDF usava
 * constantes absolutas, e as duas superfícies divergiam assim que o professor
 * mexia no tamanho do texto.
 */
export function pageTokensToCss(resolved: ResolvedPageStyle = DEFAULT_RESOLVED): CSSProperties {
  const efs = resolveElementFontSizes(resolved);
  return {
    padding: px(PAGE_MARGIN_PT),
    fontSize: px(resolved.fontSize),
    lineHeight: BASE_LINE_HEIGHT,
    fontFamily: fontFamilyToCss(resolved.fontFamily ?? DEFAULT_FONT_FAMILY_TOKEN),
    ["--doc-block-spacing"]: `${resolved.blockSpacing}px`,
    ["--doc-fs-stem"]: px(efs.stem),
    ["--doc-fs-instruction"]: px(efs.instruction),
    ["--doc-fs-alternative"]: px(efs.alternative),
    ["--doc-fs-caption"]: px(efs.caption),
  } as CSSProperties;
}
