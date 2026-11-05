/**
 * Linha de tabela mais alta que a folha (L9BC-1, L10-1).
 *
 * A linha do corpo é `wrap={false}` (0602: sem isso o react-pdf deixa a moldura numa folha e o
 * texto na outra) e o cabeçalho é `fixed` + `wrap={false}` (0603: repete a cada folha). Os dois
 * pressupõem que a linha cabe numa folha. Quando a célula é maior que ela (uma conta de 300
 * termos, uma fórmula de 70 termos a 16 pt numa coluna de 250 pt):
 *   - cabeçalho: o nó fixo é repintado em TODA folha e come a área inteira, o paginador nunca
 *     avança e o processo trava (a aba congela e, depois, estouro de memória);
 *   - corpo: o react-pdf empurra a linha para a folha seguinte e a deixa passar do pé da página,
 *     o que sobra do texto é cortado.
 *
 * A saída do Lote 10 era deixar o react-pdf FATIAR a linha. Não serve: o fatiamento de uma linha
 * em que duas células cruzam a virada de folha perde texto e desalinha as colunas, em silêncio
 * (L10-1: 4 linhas x 2 colunas, ~900 caracteres por célula). Aqui a linha alta é fatiada POR NÓS,
 * em faixas (`tableRowBands`): cada célula é partida em pedaços de texto, nos espaços, e cada
 * faixa é uma linha indivisível que cabe numa folha com folga. O react-pdf só decide em que folha
 * cada faixa cai, nunca parte uma. Nenhum caractere se perde: os pedaços de uma célula, na ordem,
 * são o texto dela (a quebra explícita que cai na emenda é a própria emenda).
 *
 * A altura não existe quando o JSX é montado (o react-pdf não a expõe), então ela é ESTIMADA, por
 * cima (largura de caractere acima da de qualquer família do Formato, inclusive a OpenDyslexic).
 * Linha estimada até `TABLE_ROW_SPLIT_PT` fica inteira e indivisível; acima disso vira faixas de
 * `TABLE_BAND_PT`. A estimativa é medida contra o PDF real em `tableRowFit.test.ts` (fronteira
 * do limiar, largura de caractere, entrelinha, recuo e fio). Garantia estrutural (L11-1): não há
 * resíduo. A fórmula é texto monoespaçado que o próprio PDF já parte em pedaços que cabem na coluna
 * (`mathPdfSegments`, em pontos seguros do LaTeX); aqui esses mesmos pedaços também trocam de faixa.
 * `tableRowBands` nunca devolve `null` e nenhuma linha do corpo volta ao fatiamento do react-pdf.
 */
import type { RichText } from "@/lib/adaptation/canonical/schema";
import {
  BASE_LINE_HEIGHT,
  PAGE_HEIGHT_PT,
  PAGE_MARGIN_PT,
  RULE_WIDTH_PT,
  TABLE_CELL_PADDING_PT,
  mathPdfFontSizePt,
} from "../pageTokens";
import { shareColumnPt } from "./columnWidth";
import { MATH_NBSP, MONO_ADVANCE_EM, type MathSegment } from "../mathAtom";
import { mathPdfSegments } from "./mathToPdfText";

/**
 * Largura média de um caractere de texto, em `em`: acima da de qualquer família do Formato. A
 * OpenDyslexic é a mais larga (as linhas reais saem ~19% mais compridas que com 0,62 nela); a
 * Liberation e a Lexend ficam em 0,5 a 0,6.
 */
const TEXT_ADVANCE_EM = 0.75;
/**
 * Caixa alta: um parágrafo todo em maiúsculas não pode subestimar. Na OpenDyslexic as maiúsculas
 * vão de 0,44 (I) a 1,19 (Q), com A, O, S, V, X, Z e G entre 1,13 e 1,16.
 */
const UPPER_ADVANCE_EM = 1.15;
/**
 * Os glifos largos da OpenDyslexic (medidos no arquivo): W 1,42, M 1,24 e m 1,17 em. Uma "parede" de
 * W ou M, ou de m, passava de 40% do estimado e a linha estourava a folha com o texto cortado. Só
 * estes três: o texto comum (minúsculas a 0,75, poucas maiúsculas) segue medido como antes.
 */
const WIDE_ADVANCE_EM: Record<string, number> = { W: 1.45, M: 1.25, m: 1.2 };
/** Sobra de quebra de palavra: a linha raramente enche até a borda. */
const WRAP_WASTE = 1.15;
/** A largura útil (em pt) do texto de uma célula, numa tabela de `parts` colunas iguais: a mesma no PDF e no Word. */
export const tableCellColumnPt = (parts: number): number =>
  shareColumnPt(undefined, {
    minus: RULE_WIDTH_PT,
    parts,
    partMinus: 2 * TABLE_CELL_PADDING_PT + RULE_WIDTH_PT,
  });
/** A altura da área útil da folha. */
const PAGE_CONTENT_PT = PAGE_HEIGHT_PT - 2 * PAGE_MARGIN_PT;
/**
 * Uma linha do corpo acima disto (90% da folha, estimada) deixa de ser indivisível e vira faixas.
 * Abaixo, a estimativa é por cima da altura real, então a linha cabe numa folha.
 */
export const TABLE_ROW_SPLIT_PT = PAGE_CONTENT_PT * 0.9;
/** A altura (estimada) de cada faixa de uma linha alta: com folga numa folha, mesmo errando por cima. */
export const TABLE_BAND_PT = PAGE_CONTENT_PT * 0.45;
/** O cabeçalho repetido acima disto (35% da folha) deixa de ser fixo: repetido em toda folha, come o papel. */
export const TABLE_HEADER_RELEASE_PT = PAGE_CONTENT_PT * 0.35;

const UPPER = /\p{Lu}/u;

/** Largura de um pedaço de texto, em pt. */
function textWidthPt(text: string, fontPt: number): number {
  let width = 0;
  for (const ch of text) width += (WIDE_ADVANCE_EM[ch] ?? (UPPER.test(ch) ? UPPER_ADVANCE_EM : TEXT_ADVANCE_EM)) * fontPt;
  return width;
}

/** Entrelinha da célula: a do corpo, ou a da fórmula (maior) quando a célula tem fórmula. */
function cellLinePt(content: RichText, fontPt: number): number {
  const sizes = content.map((run) =>
    run.type === "inlineMath" ? mathPdfFontSizePt(fontPt) : (run.fontSize ?? fontPt),
  );
  return BASE_LINE_HEIGHT * Math.max(fontPt, ...sizes);
}

/** Um pedaço indivisível da célula: palavra (com os espaços que a seguem), fórmula ou quebra explícita. */
type Token =
  | { kind: "text"; run: number; text: string; widthPt: number; fontPt: number }
  | { kind: "math"; run: number; widthPt: number; piece?: MathSegment }
  | { kind: "newline"; run: number };

function tokenize(content: RichText, fontPt: number, columnPt: number): Token[] {
  const mathPt = mathPdfFontSizePt(fontPt);
  const room = Math.max(1, columnPt);
  const tokens: Token[] = [];
  content.forEach((run, r) => {
    if (run.type === "inlineMath") {
      const segments = mathPdfSegments(run.latex, fontPt, columnPt);
      if (segments.length === 1) {
        // cabe na coluna: um átomo só, como no papel
        tokens.push({ kind: "math", run: r, widthPt: run.latex.length * MONO_ADVANCE_EM * mathPt });
        return;
      }
      // não cabe: o papel a parte em pedaços (`mathPdfSegments`), um por linha quando passa de meia
      // coluna (dois não dividem a linha: conta uma linha exata, sem a sobra de quebra de palavra), e é nesses pontos seguros que ela também pode trocar de faixa
      for (const piece of segments) {
        const natural = (piece.text.length + (piece.joint === "space" ? 1 : 0)) * MONO_ADVANCE_EM * mathPt;
        tokens.push({ kind: "math", run: r, widthPt: natural > room / 2 ? room / WRAP_WASTE : natural, piece });
      }
      return;
    }
    const runPt = run.fontSize ?? fontPt;
    run.text.split("\n").forEach((line, i) => {
      if (i > 0) tokens.push({ kind: "newline", run: r });
      for (const word of line.match(/\S+\s*|\s+/g) ?? []) {
        tokens.push({ kind: "text", run: r, text: word, widthPt: textWidthPt(word, runPt), fontPt: runPt });
      }
    });
  });
  return tokens;
}

/**
 * O preenchimento das linhas de uma célula: quantas linhas já abriu (a aberta conta, mesmo vazia) e
 * quanto da última está usado. É um empacotamento guloso, palavra a palavra, como o quebrador de
 * linha: o agregado "largura total / coluna" subestima quando a palavra é larga (duas palavras de
 * 52% da coluna ocupam DUAS linhas, não uma e pouco), e foi isso que cortou a "parede" de W e M da
 * OpenDyslexic. Cada largura leva a sobra de quebra (`WRAP_WASTE`).
 */
type Fill = { lines: number; used: number };
const EMPTY_FILL: Fill = { lines: 1, used: 0 };

/** Põe um pedaço indivisível de `widthPt` na linha aberta; não cabendo, abre outra; mais largo que a coluna, ocupa várias. */
function place(fill: Fill, widthPt: number, room: number): Fill {
  const w = widthPt * WRAP_WASTE;
  // 1e-9: n pedaços exatos de `room / 1,15` voltam a caber na linha apesar do arredondamento
  let { lines, used } = fill;
  if (used > 0 && used + w > room + 1e-9) {
    lines += 1;
    used = 0;
  }
  if (w > room + 1e-9) {
    const extra = Math.ceil(w / room - 1e-9) - 1;
    return { lines: lines + extra, used: w - extra * room };
  }
  return { lines, used: used + w };
}

/** Quebra explícita: abre outra linha. */
const breakLine = (fill: Fill): Fill => ({ lines: fill.lines + 1, used: 0 });

/** Linhas de texto que a célula ocupa na coluna, por cima. */
function cellLines(content: RichText, fontPt: number, columnPt: number): number {
  const room = Math.max(1, columnPt);
  let fill = EMPTY_FILL;
  for (const token of tokenize(content, fontPt, columnPt)) {
    fill = token.kind === "newline" ? breakLine(fill) : place(fill, token.widthPt, room);
  }
  return fill.lines;
}

/** A altura estimada da linha: a célula mais alta, mais o recuo e o fio da célula. */
export function estimatedRowHeightPt(row: RichText[], fontPt: number, columnPt: number): number {
  const tallest = row.reduce(
    (max, cell) => Math.max(max, cellLines(cell, fontPt, columnPt) * cellLinePt(cell, fontPt)),
    cellLinePt([], fontPt),
  );
  return tallest + 2 * TABLE_CELL_PADDING_PT + RULE_WIDTH_PT;
}

/** A linha do corpo é grande demais para ser indivisível. */
export function rowNeedsSplit(row: RichText[], fontPt: number, columnPt: number): boolean {
  return estimatedRowHeightPt(row, fontPt, columnPt) > TABLE_ROW_SPLIT_PT;
}

/** O cabeçalho é grande demais para ser repetido em toda folha. */
export function headerNeedsRelease(row: RichText[], fontPt: number, columnPt: number): boolean {
  return estimatedRowHeightPt(row, fontPt, columnPt) > TABLE_HEADER_RELEASE_PT;
}

/**
 * Parte uma palavra que sozinha passa de uma faixa inteira (uma "palavra" de milhares de
 * caracteres, sem espaço) em pedaços que cabem, sem separar um par substituto.
 */
function chunkWord(text: string, fontPt: number, maxWidthPt: number): string[] {
  const chunks: string[] = [];
  let current = "";
  let width = 0;
  for (const ch of text) {
    const w = textWidthPt(ch, fontPt);
    if (current !== "" && width + w > maxWidthPt) {
      chunks.push(current);
      current = "";
      width = 0;
    }
    current += ch;
    width += w;
  }
  return [...chunks, current];
}

/**
 * Parte UMA célula em faixas de, no máximo, `maxLines` linhas estimadas, nos espaços. A fórmula
 * que não cabe na coluna já vem em pedaços (`tokenize`), cortados em pontos seguros do LaTeX:
 * os pedaços de uma mesma faixa voltam a ser UMA fórmula, e a que cabe inteira segue como o
 * nó original.
 */
function bandCell(content: RichText, fontPt: number, columnPt: number, maxLines: number): RichText[] {
  const room = Math.max(1, columnPt);
  const bandWidth = (maxLines * room) / WRAP_WASTE;
  const raw = tokenize(content, fontPt, columnPt);
  // uma "palavra" maior que uma faixa inteira (milhares de caracteres, sem espaço) é picada
  const tokens = raw.flatMap((token): Token[] => {
    if (token.kind !== "text" || token.widthPt <= bandWidth) return [token];
    return chunkWord(token.text, token.fontPt, bandWidth).map((text) => ({
      kind: "text",
      run: token.run,
      text,
      widthPt: textWidthPt(text, token.fontPt),
      fontPt: token.fontPt,
    }));
  });

  const bands: RichText[] = [];
  /** Os runs da faixa aberta, cada um com o índice do run de origem (para emendar texto vizinho). */
  let band: { run: number; node: RichText[number] }[] = [];
  let fill = EMPTY_FILL;
  const close = () => {
    if (band.length > 0) bands.push(band.map((item) => item.node));
    band = [];
    fill = EMPTY_FILL;
  };
  const pushText = (run: number, text: string) => {
    const last = band[band.length - 1];
    if (last && last.run === run) {
      (last.node as { text: string }).text += text;
    } else {
      band.push({ run, node: { ...content[run], text } as RichText[number] });
    }
  };
  /** Um pedaço de fórmula: emenda no anterior da faixa, se for da mesma fórmula, ou abre um nó. */
  const pushPiece = (run: number, piece: MathSegment) => {
    // o pedaço vem com os espaços já inquebráveis (`latexLayoutAtom`): volta a espaço, para o
    // PDF poder partir o nó emendado nos mesmos pontos do original
    const latex = piece.text.replaceAll(MATH_NBSP, " ");
    const last = band[band.length - 1];
    if (last && last.run === run && last.node.type === "inlineMath") {
      last.node.latex += (piece.joint === "space" ? " " : "") + latex;
    } else {
      band.push({ run, node: { ...content[run], latex } as RichText[number] });
    }
  };
  for (const token of tokens) {
    if (token.kind === "newline") {
      fill = breakLine(fill);
      // a quebra que cai na emenda entre duas faixas é a própria emenda
      if (fill.lines > maxLines) close();
      else pushText(token.run, "\n");
      continue;
    }
    if (place(fill, token.widthPt, room).lines > maxLines) close();
    fill = place(fill, token.widthPt, room);
    if (token.kind === "text") pushText(token.run, token.text);
    else if (token.piece) pushPiece(token.run, token.piece);
    else band.push({ run: token.run, node: content[token.run] });
  }
  close();
  return bands;
}

/**
 * A linha em faixas indivisíveis. Linha que cabe numa folha volta como está (`[row]`). Nunca
 * `null`: o texto parte nos espaços, a palavra gigante em pedaços e a fórmula nos pontos seguros
 * do LaTeX, então toda linha vira faixas que cabem e o react-pdf nunca fatia uma linha do corpo.
 */
export function tableRowBands(row: RichText[], fontPt: number, columnPt: number): RichText[][][] {
  if (!rowNeedsSplit(row, fontPt, columnPt)) return [[...row]];
  const perCell = row.map((cell) => {
    const linePt = cellLinePt(cell, fontPt);
    const maxLines = Math.max(1, Math.floor(TABLE_BAND_PT / linePt));
    return bandCell(cell, fontPt, columnPt, maxLines);
  });
  const count = Math.max(...perCell.map((bands) => bands.length));
  return Array.from({ length: count }, (_, i) => perCell.map((bands) => bands[i] ?? []));
}
