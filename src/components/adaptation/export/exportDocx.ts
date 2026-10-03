/**
 * Word (.docx) export.
 *
 * `docxFileName`        — pure filename derivation.
 * render helpers        — richTextToRuns / blockToDocxParagraphs / headerParagraphs:
 *                         pure canonical→docx mapping, exported for direct unit tests.
 * `docxExportWarnings`  — what will NOT survive the trip to Word (shown BEFORE the
 *                         download, so "Word gerado!" never covers a silent loss).
 * `documentRunStyle`    — pure pageStyle → docx run mapping (font + half-points + ink + idioma).
 * `documentMetadata`    — pure header → metadados do arquivo (título, autor, descrição).
 * `docxContentBlocks`   — pure document + PanelSettings → docx blocks, já com as
 *                         quebras de página (switch do painel e `style.pageBreakBefore`).
 * `docxSectionProperties` — margem da página derivada de `PAGE_MARGIN_PT`.
 * `docxFooter`          — rodapé repetido em toda página (título · escola ·
 *                         "Página X de Y" pelos campos do Word).
 * `downloadDocx`        — side-effecting blob + DOM download (v8 ignore).
 *
 * Presentation mirrors the PDF (`render/pdf/PdfAnswer`, `PdfLeafBlocks`,
 * `PdfQuestion`) — same content, same ORDER, and the gabarito equally hidden:
 * empty markers everywhere, `ordering` left in authored order (sorting it would
 * BE the answer key), `fillBlank` rendering nothing because its gaps live inline
 * in the stem. Every canonical block type and answer kind is covered; the parity
 * test in exportDocx.test.ts fails if a new one is added without a mapper.
 */

import {
  Document,
  Packer,
  Paragraph,
  TextRun,
  Table,
  TableRow,
  TableCell,
  TableLayoutType,
  WidthType,
  HeadingLevel,
  AlignmentType,
  PageBreak,
  BorderStyle,
  ShadingType,
  Tab,
  TabStopType,
  TabStopPosition,
  Footer,
  PageNumber,
  LineRuleType,
} from "docx";
import type {
  CanonicalDocument,
  DocumentHeader,
  Block,
  Inline,
  NodeStyle,
  RichText,
  PageStyle,
} from "@/lib/adaptation/canonical/schema";
import { isAllowedColor } from "@/lib/adaptation/canonical/colors";
import {
  fontFamilyToDocx,
  DOCX_NON_STANDARD_FONTS,
  isFontFamilyToken,
} from "@/lib/adaptation/canonical/fontFamily";
import {
  BASE_FONT_PT,
  ELEMENT_FONT_RATIOS,
  DEFAULT_FONT_FAMILY_TOKEN,
  DEFAULT_INK,
  SCAFFOLDING_BG,
  SCAFFOLDING_BORDER,
  SCAFFOLDING_LABEL,
  HEADING_PT,
  PAGE_MARGIN_PT,
  RULE_COLOR,
  RULE_WIDTH_PT,
  ANSWER_LINE_COLOR,
  ANSWER_LINE_WIDTH_PT,
  CHECKBOX_BOX_BORDER_PT,
  CHECKBOX_BOX_COLOR,
  TRUE_FALSE_MARKER_TEXT,
  ORDERING_MARKER_TEXT,
  ANSWER_ITEM_GAP_PT,
  MATCHING_LINK_GAP_PT,
  TABLE_CELL_PADDING_PT,
  BASE_LINE_HEIGHT,
  BASE_BLOCK_SPACING_PX,
} from "../render/pageTokens";
import { indexToLetter } from "../render/letters";
import {
  documentHasMath,
  emptyItemWarnings,
  everyBlock,
  mathLossWarnings,
  MATH_TYPOGRAPHY_WARNING,
} from "./exportWarnings";
import { perQuestionBreakFlags } from "../render/perQuestionBreaks";
import { latexLayoutAtom } from "../render/mathAtom";
import { DEFAULT_PANEL_SETTINGS, formatHeaderDateBR, type PanelSettings } from "./panelSettings";
import { HEADER_SPACING_PT } from "../render/headerSpacing";
import { documentTitle, FALLBACK_TITLE } from "../titleField";
import {
  FOOTER_COLOR,
  FOOTER_FONT_SIZE_PT,
  FOOTER_SEPARATOR,
  footerPrefixParts,
} from "../render/footerLabel";

/** A docx section child. Tables are blocks too, not paragraphs. */
export type DocxBlock = Paragraph | Table;

/** Monospace face for LaTeX source, mirroring the PDF's MATH_PDF_STYLE. */
const MATH_FONT = "Courier New";
/** Question instruction/enunciado size in half-points (10.5pt, as in the PDF). */
const SUB_SIZE = 21;
/**
 * Tinta do texto no Word: o MESMO `DEFAULT_INK` das outras três superfícies,
 * sem o `#` (a unidade do docx é o hex cru). Vale para o título e, via
 * `documentRunStyle`, para o corpo inteiro: o título tem que casar com o resto
 * do documento, não com a paleta do estilo `Heading1` da lib.
 *
 * Antes era preto puro escrito à mão, e o `docDefaults` saía sem `<w:color>`:
 * o .docx era a única das quatro saídas fora da tinta que o professor vê
 * enquanto edita (achado 0166).
 */
const DOCX_INK = DEFAULT_INK.slice(1);
/** Caption size in half-points — the sheet's `caption` element size (10pt). */
const CAPTION_SIZE = Math.round(ELEMENT_FONT_RATIOS.caption * BASE_FONT_PT * 2);

/**
 * Moldura + fundo da caixa do andaime, com os tokens compartilhados das outras
 * três superfícies (o Word não tem `<View>`: a caixa é a borda de cada
 * parágrafo do bloco). Sem ela, e sem o rótulo, os passos saíam soltos no corpo
 * do texto e se disfarçavam das questões numeradas logo abaixo (achado 0163).
 */
const SCAFFOLDING_EDGE = {
  style: BorderStyle.SINGLE,
  size: 4,
  color: SCAFFOLDING_BORDER.slice(1),
} as const;
const SCAFFOLDING_BOX = {
  border: {
    top: SCAFFOLDING_EDGE,
    bottom: SCAFFOLDING_EDGE,
    left: SCAFFOLDING_EDGE,
    right: SCAFFOLDING_EDGE,
  },
  shading: { type: ShadingType.CLEAR, fill: SCAFFOLDING_BG.slice(1) },
} as const;

/**
 * A régua do divisor: borda inferior de um parágrafo vazio, com os tokens de
 * página das outras superfícies (`RULE_COLOR`/`RULE_WIDTH_PT`). A unidade da
 * borda no OOXML é o oitavo de ponto, daí o `* 8`.
 */
const DIVIDER_RULE = {
  border: {
    bottom: {
      style: BorderStyle.SINGLE,
      size: Math.round(RULE_WIDTH_PT * 8),
      color: RULE_COLOR.slice(1),
    },
  },
} as const;

/**
 * A pauta da questão aberta (achado 0523): borda inferior de um parágrafo
 * vazio, na largura útil da coluna em qualquer fonte e corpo, com a tinta, a
 * espessura e o traço tracejado dos tokens da pauta das outras superfícies.
 * Antes eram 60 `_` de texto no corpo e na tinta do documento: a largura
 * dependia do avanço do glifo e, a partir de ~15,5 pt na Arial, cada linha
 * passava da coluna e quebrava em duas.
 */
const ANSWER_LINE_RULE = {
  border: {
    bottom: {
      style: BorderStyle.DASHED,
      size: Math.round(ANSWER_LINE_WIDTH_PT * 8),
      color: ANSWER_LINE_COLOR.slice(1),
    },
  },
} as const;

/**
 * Cabeçalho do documento, espelhando `PdfHeader` (`render/pdf/AdaptationPdf`):
 * título 18pt negrito centralizado, escola 11pt centralizada, Professor(a)/Data
 * a 10pt nos extremos e uma régua fechando o bloco (achado 0142). Os corpos vão
 * em meios-pontos, a unidade do OOXML; a régua usa a mesma espessura de token
 * das outras superfícies e a cor do filete do PDF.
 */
const HEADER_TITLE_HALF_PT = 18 * 2;
const HEADER_SCHOOL_HALF_PT = 11 * 2;
const HEADER_META_HALF_PT = 10 * 2;
const HEADER_RULE_COLOR = "333333";
const HEADER_RULE = {
  border: {
    bottom: {
      style: BorderStyle.SINGLE,
      size: Math.round(RULE_WIDTH_PT * 8),
      color: HEADER_RULE_COLOR,
    },
  },
} as const;

/** Identidade do produto que assina o arquivo exportado (achado 0344). */
const PRODUCT_NAME = "Olhar Singular";

/** Idioma do documento inteiro, o mesmo que o PDF declara (achado 0344). */
const DOCUMENT_LANGUAGE = "pt-BR";

/** Pontos → twips (1/20 pt), a unidade de espaçamento do OOXML. */
const ptToTwip = (pt: number): number => Math.round(pt * 20);

/**
 * Derive a safe .docx filename from the document header title.
 *
 * Achado 0100: with no header title, fall back to the document's first heading
 * (`documentTitle`), the same chain the printed title and the metadata use.
 */
export function docxFileName(header: DocumentHeader, document?: CanonicalDocument): string {
  const title = header.title?.trim() || (document ? documentTitle(document) : "");
  if (!title) return "atividade-adaptada.docx";
  const slug = title
    .toLowerCase()
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  return `${slug || "atividade-adaptada"}.docx`;
}

/** Formatting inherited from the surrounding context (table header, instruction). */
type RunStyle = {
  bold?: boolean;
  italics?: boolean;
  size?: number;
  color?: string;
  font?: string;
};

/** Paragraph properties a `NodeStyle` contributes. */
type ParagraphStyle = {
  alignment?: (typeof ALIGNMENT)[keyof typeof ALIGNMENT];
  keepNext?: boolean;
  keepLines?: boolean;
};

/**
 * Achado 0271: a questão é a unidade da folha impressa também no Word. Todo
 * parágrafo dela, menos o de fecho, anda com o seguinte (`w:keepNext`) e não se
 * parte ao meio (`w:keepLines`); sem isso o Word deixava número + enunciado no
 * pé da página e as alternativas órfãs na seguinte. Quando a cadeia não cabe
 * numa página vazia, o próprio Word ignora o `keepNext` e parte a questão, então
 * a questão maior que uma folha não some (o risco que bloqueou o 0702 no PDF).
 * Exceção (achado 1109): as linhas de dados da tabela não entram na cadeia; o
 * LibreOffice empurra a cadeia inteira para a folha seguinte antes de partir.
 */
const KEEP_WITH_NEXT = { keepNext: true, keepLines: true } as const;

/** `NodeStyle.align` → OOXML `w:jc` (note: `justify` is `both` in the docx lib). */
const ALIGNMENT = {
  left: AlignmentType.LEFT,
  center: AlignmentType.CENTER,
  right: AlignmentType.RIGHT,
  justify: AlignmentType.JUSTIFIED,
} as const;

/** px (the canonical NodeStyle unit) → pt, the unit shared with the PDF. */
const pxToPt = (px: number): number => px * (72 / 96);
/** px → twips, the OOXML spacing unit (1pt = 20 twips). */
const pxToTwips = (px: number): number => Math.round(pxToPt(px) * 20);

/**
 * Achado 0269: os vãos que o PDF desenha e o Word não tinha.
 *
 * - `DEFAULT_BLOCK_GAP_TWIPS`: o `blockSpacing` default do documento (16px = 12pt),
 *   o `blockGap` que `AdaptationPdf` dá a todo bloco de topo sem `spacingAfter`.
 * - `QUESTION_INNER_GAP_TWIPS`: 6pt entre os blocos do stem, o
 *   `QUESTION_INNER_GAP_PT` do `PdfQuestion`.
 * - `QUESTION_PART_GAP_TWIPS`: 6pt depois do enunciado e da instrução, o
 *   mesmo `QUESTION_INNER_GAP_PT` que o `PdfQuestion` usa ali (achado 0270).
 */
const DEFAULT_BLOCK_GAP_TWIPS = pxToTwips(BASE_BLOCK_SPACING_PX);

/**
 * Achado 0518 (corrige o 0269): a entrelinha do Word em altura ABSOLUTA, o
 * `corpo x BASE_LINE_HEIGHT` que o PDF (`pdfTextSize`) e as telas medem. O
 * `lineRule="auto"` multiplicava a entrelinha SIMPLES da fonte (1,149 em na
 * Arial), e a linha do Word saía 15% mais alta que no PDF: a prova virava folha
 * antes da prévia. `atLeast`, e não `exact`, para a fórmula ou o run maior
 * dentro da linha crescerem em vez de serem cortados. Como no PDF, que repete a
 * razão ao lado de cada corpo, a altura sai do corpo DE CADA parágrafo; quem
 * está no corpo do documento herda a do `pPrDefault` (`docxDocumentStyles`).
 */
type LineSpacing = { line?: number; lineRule?: (typeof LineRuleType)[keyof typeof LineRuleType] };
const lineSpacing = (halfPoints: number): LineSpacing => ({
  line: Math.round((halfPoints / 2) * BASE_LINE_HEIGHT * 20),
  lineRule: LineRuleType.AT_LEAST,
});
/** A linha de um corpo próprio; sem corpo próprio, nada (herda o documento). */
const lineFor = (halfPoints?: number): LineSpacing =>
  halfPoints === undefined ? {} : lineSpacing(halfPoints);
/** `{ spacing }` com a linha e o resto, ou nada quando os dois vêm vazios. */
const spacingWith = (line: LineSpacing, rest: { after?: number } = {}) => {
  const spacing = { ...line, ...rest };
  return Object.keys(spacing).length > 0 ? { spacing } : {};
};
const QUESTION_INNER_GAP_TWIPS = ptToTwip(6);
const QUESTION_PART_GAP_TWIPS = ptToTwip(6);
/** An allowed palette color in the docx unit (raw hex, no `#`); `undefined` otherwise. */
const docxColor = (color?: string): string | undefined =>
  color !== undefined && isAllowedColor(color) ? color.slice(1).toUpperCase() : undefined;

/**
 * O `NodeStyle` do bloco projetado no docx — o análogo de `nodeStyleToPdf` e de
 * `nodeStyleToCss`, quebrado nas três formas que o OOXML exige:
 *
 * - `paragraph`: vale para TODO parágrafo do bloco (o alinhamento é do bloco);
 * - `spacing`:   só para o ÚLTIMO, senão o `spacingAfter` (que é o espaço DEPOIS
 *                do bloco) viraria espaço entre as linhas de dentro dele;
 * - `run`:       cor/corpo/fonte herdados por todo run do bloco.
 *
 * Sem isso o Word era a única das quatro superfícies que descartava a
 * formatação por nó em silêncio (achado 0134).
 */
export function nodeStyleToDocx(style?: NodeStyle): {
  paragraph: ParagraphStyle;
  spacing: { spacing?: { after: number } };
  run: RunStyle;
} {
  const paragraph: ParagraphStyle = {};
  const spacing: { spacing?: { after: number } } = {};
  const run: RunStyle = {};
  if (!style) return { paragraph, spacing, run };

  if (style.align !== undefined) paragraph.alignment = ALIGNMENT[style.align];
  if (style.spacingAfter !== undefined) spacing.spacing = { after: pxToTwips(style.spacingAfter) };
  const color = docxColor(style.color);
  if (color !== undefined) run.color = color;
  if (style.fontSize !== undefined) run.size = Math.round(pxToPt(style.fontSize) * 2);
  if (style.fontFamily !== undefined) run.font = fontFamilyToDocx(style.fontFamily);

  return { paragraph, spacing, run };
}

export function richTextToRuns(nodes: Inline[], inherited: RunStyle = {}): TextRun[] {
  return nodes.map((node) => {
    if (node.type === "inlineMath") {
      // Word has no KaTeX: sai o LaTeX, que ao menos mantém o conteúdo
      // visível — dropá-lo era perda silenciosa de dado no meio da frase.
      // Nunca o `alt`: ele é o texto alternativo da fórmula, não a fórmula
      // (achado 0803), mesma política do PDF e do "Copiar".
      return new TextRun({
        ...inherited,
        text: latexLayoutAtom(node.latex),
        font: MATH_FONT,
      });
    }
    // Cor e corpo do próprio run vencem o herdado, validados pela MESMA paleta
    // que a tela (`textRunStyle`) e o PDF (`marksToPdfStyle`) usam. Ignorá-los
    // apagava o destaque que a professora pintou (achado 0134); `fontSize`
    // inline é pt, como nas outras superfícies, daí o meio-ponto por 2.
    return new TextRun({
      ...inherited,
      text: node.text,
      bold: node.marks?.includes("bold") || inherited.bold,
      italics: node.marks?.includes("italic") || inherited.italics,
      underline: node.marks?.includes("underline") ? {} : undefined,
      strike: node.marks?.includes("strike"),
      color: docxColor(node.color) ?? inherited.color,
      size: node.fontSize !== undefined && node.fontSize > 0
        ? Math.round(node.fontSize * 2)
        : inherited.size,
    });
  });
}

/**
 * Geometria de toda linha de resposta (achado 0454): nasce na margem, como o
 * marcador da tela, da prévia e do PDF (`PdfAnswer` não recua o `ROW`), e leva
 * depois o mesmo vão entre itens do PDF, `ANSWER_ITEM_GAP_PT`. Antes o Word
 * recuava 18 pt e colava as linhas: as caixas do checkbox viravam uma barra.
 */
const ANSWER_ROW_SPACING = { spacing: { after: ptToTwip(ANSWER_ITEM_GAP_PT) } } as const;

/** The block-level style carried into the answer rows (achado 0134). */
type InheritedStyle = { paragraph: ParagraphStyle; run: RunStyle };
const NO_STYLE: InheritedStyle = { paragraph: {}, run: {} };

/**
 * A caixa do checkbox é DESENHADA no Word, como no PDF (achado 0358): uma borda
 * de run (`w:bdr`) em volta de espaços inquebráveis, em vez do texto `[ ]` que
 * o arquivo trazia — dois colchetes finos onde as telas mostram um quadrado
 * fechado, alvo menor para o aluno marcar com X.
 *
 * A borda de run é o único traço do OOXML que acompanha o corpo do documento
 * sem posicionamento absoluto: a altura sai da linha e a largura, dos espaços.
 * Por isso a caixa do Word é QUADRADA POR APROXIMAÇÃO (três espaços no corpo
 * escolhido), enquanto PDF e telas leem o lado exato de `CHECKBOX_BOX_PX`. A
 * espessura e a tinta são as mesmas das outras superfícies; a unidade da borda
 * no OOXML é o oitavo de ponto, daí o `* 8`, como em `DIVIDER_RULE`.
 */
const CHECKBOX_BOX_TEXT = "\u00a0\u00a0\u00a0";
const CHECKBOX_BOX_BORDER = {
  style: BorderStyle.SINGLE,
  size: Math.round(CHECKBOX_BOX_BORDER_PT * 8),
  color: CHECKBOX_BOX_COLOR.slice(1),
  space: 0,
} as const;

/**
 * O vão entre itens de resposta com a linha do corpo herdado do bloco (achado
 * 0518). Vale só ENTRE itens, como o `rowStyle` do `PdfAnswer` (achado 0707): a
 * última linha sai com `after` zero, porque o parágrafo que fecha a questão já
 * dá o vão de bloco, e os dois somados davam 18 pt contra 12 no PDF (achado 0519).
 */
const answerRowSpacing = (style: InheritedStyle, last: boolean) =>
  spacingWith(lineFor(style.run.size), last ? { after: 0 } : ANSWER_ROW_SPACING.spacing);

/** Se o item `index` é o último de `count` (o que fecha a resposta). */
const isLast = (index: number, count: number) => index === count - 1;

function checkboxRow(content: RichText, style: InheritedStyle, last: boolean): Paragraph {
  return new Paragraph({
    ...style.paragraph,
    ...answerRowSpacing(style, last),
    children: [
      new TextRun({ ...style.run, text: CHECKBOX_BOX_TEXT, border: CHECKBOX_BOX_BORDER }),
      new TextRun({ ...style.run, text: " " }),
      ...richTextToRuns(content, style.run),
    ],
  });
}

/** An answer row: an empty marker plus the item's content. */
function answerRow(
  marker: string,
  content: RichText,
  style: InheritedStyle,
  last: boolean,
): Paragraph {
  return new Paragraph({
    ...style.paragraph,
    ...answerRowSpacing(style, last),
    children: [
      new TextRun({ ...style.run, text: `${marker} ` }),
      ...richTextToRuns(content, style.run),
    ],
  });
}

/**
 * Associação em colunas (achado 0455), espelhando a linha do PDF (`PdfAnswer`:
 * esquerda `FLEX`, elo de largura fixa, direita `FLEX`). Antes cada par era um
 * parágrafo `esquerda  ↔  direita`, e a seta e o termo da direita mudavam de x
 * conforme o comprimento do termo da esquerda: no Word não havia coluna da
 * direita para o aluno ligar.
 *
 * Tabela SEM bordas e de layout fixo (o Word não reajusta a grade pelo
 * conteúdo), sem margem de célula para a coluna da esquerda nascer na margem
 * como as outras linhas de resposta (achado 0454). O elo tem a largura de um
 * corpo de alternativa mais o vão `MATCHING_LINK_GAP_PT` de cada lado; o resto
 * da largura útil se divide igualmente entre as duas colunas de texto.
 */
const MATCHING_LINK_COLUMN_TWIPS = ptToTwip(
  BASE_FONT_PT * ELEMENT_FONT_RATIOS.alternative + 2 * MATCHING_LINK_GAP_PT,
);
/** Grade [esquerda, elo, direita]; função porque a largura útil é declarada mais abaixo. */
function matchingColumnWidths(): number[] {
  const text = Math.floor((DOCX_CONTENT_WIDTH_TWIPS - MATCHING_LINK_COLUMN_TWIPS) / 2);
  return [text, DOCX_CONTENT_WIDTH_TWIPS - 2 * text, text];
}
/**
 * Moldura da questão-tabela (achado 0522): sem `borders` a lib emite
 * `<w:tblBorders>` single com `w:color="auto"`, e o Word pinta preto enquanto
 * o PDF e a tela traçam a régua do documento. Mesma tinta e espessura dos
 * outros traços (`RULE_COLOR`/`RULE_WIDTH_PT`, em oitavos de ponto).
 */
const TABLE_RULE_EDGE = {
  style: BorderStyle.SINGLE,
  size: Math.round(RULE_WIDTH_PT * 8),
  color: RULE_COLOR.slice(1),
} as const;
const TABLE_RULE_BORDERS = {
  top: TABLE_RULE_EDGE,
  bottom: TABLE_RULE_EDGE,
  left: TABLE_RULE_EDGE,
  right: TABLE_RULE_EDGE,
  insideHorizontal: TABLE_RULE_EDGE,
  insideVertical: TABLE_RULE_EDGE,
} as const;
const NO_EDGE = { style: BorderStyle.NONE, size: 0, color: "auto" } as const;
const NO_TABLE_BORDERS = {
  top: NO_EDGE,
  bottom: NO_EDGE,
  left: NO_EDGE,
  right: NO_EDGE,
  insideHorizontal: NO_EDGE,
  insideVertical: NO_EDGE,
} as const;

function matchingTable(
  pairs: Extract<Extract<Block, { type: "question" }>["answer"], { kind: "matching" }>["pairs"],
  style: InheritedStyle,
): Table {
  const cell = (paragraph: Paragraph) =>
    new TableCell({ borders: NO_TABLE_BORDERS, children: [paragraph] });
  const side = (content: RichText, last: boolean) =>
    cell(
      new Paragraph({
        ...style.paragraph,
        ...answerRowSpacing(style, last),
        children: richTextToRuns(content, style.run),
      }),
    );
  return new Table({
    width: { size: DOCX_CONTENT_WIDTH_TWIPS, type: WidthType.DXA },
    columnWidths: matchingColumnWidths(),
    layout: TableLayoutType.FIXED,
    borders: NO_TABLE_BORDERS,
    margins: { top: 0, bottom: 0, left: 0, right: 0 },
    rows: pairs.map(
      (pair, i) =>
        new TableRow({
          cantSplit: true,
          children: [
            side(pair.left, isLast(i, pairs.length)),
            cell(
              new Paragraph({
                alignment: AlignmentType.CENTER,
                ...answerRowSpacing(style, isLast(i, pairs.length)),
                children: [new TextRun({ ...style.run, text: "↔" })],
              }),
            ),
            side(pair.right, isLast(i, pairs.length)),
          ],
        }),
    ),
  });
}

/** Recuo da célula da tabela em twips, o mesmo `TABLE_CELL_PADDING_PT` do PDF. */
const TABLE_CELL_MARGIN_TWIPS = Math.round(TABLE_CELL_PADDING_PT * 20);
const TABLE_CELL_MARGINS = {
  top: TABLE_CELL_MARGIN_TWIPS,
  bottom: TABLE_CELL_MARGIN_TWIPS,
  left: TABLE_CELL_MARGIN_TWIPS,
  right: TABLE_CELL_MARGIN_TWIPS,
};

/**
 * The typed answer, mirroring PdfAnswer kind by kind. Exhaustive over the union
 * (no default), so a new kind is a compile error rather than a silent omission.
 */
function answerToDocx(
  answer: Extract<Block, { type: "question" }>["answer"],
  style: InheritedStyle = NO_STYLE,
): DocxBlock[] {
  switch (answer.kind) {
    case "open": {
      const lines = answer.answerLines ?? 3;
      return Array.from(
        { length: lines },
        () =>
          new Paragraph({
            ...style.paragraph,
            ...ANSWER_LINE_RULE,
            ...spacingWith(lineFor(style.run.size)),
            children: [],
          }),
      );
    }
    case "multipleChoice":
      return answer.alternatives.map((alternative, i, all) =>
        // No ✔ on the correct one — the gabarito stays hidden, as in the PDF.
        answerRow(`${indexToLetter(i)})`, alternative.content, style, isLast(i, all.length)),
      );
    case "trueFalse":
      return answer.items.map((item, i, all) =>
        answerRow(TRUE_FALSE_MARKER_TEXT, item.content, style, isLast(i, all.length)),
      );
    case "checkbox":
      // Caixa vazia para todo item, nunca marcada — `checked` é o gabarito.
      return answer.items.map((item, i, all) =>
        checkboxRow(item.content, style, isLast(i, all.length)),
      );
    case "matching":
      return [matchingTable(answer.pairs, style)];
    case "ordering":
      // Authored order, NOT sorted by `position` — sorting would reveal the answer.
      return answer.items.map((item, i, all) =>
        answerRow(ORDERING_MARKER_TEXT, item.content, style, isLast(i, all.length)),
      );
    case "fillBlank":
      // The gaps live inline in the stem; there is no separate answer to show
      // (same contract as PdfAnswer, which renders an empty view here).
      return [];
    case "table": {
      const [header, ...body] = answer.rows;
      if (!header) return [];
      // Achado 1109: só o cabeçalho herda o `keepNext` da questão, prendendo o
      // enunciado/instrução e ele à 1ª linha de dados. Nas linhas de dados o
      // `keepNext` encadeava a tabela inteira num bloco só, e a questão-tabela
      // maior que uma folha era empurrada toda para a seguinte, deixando o pé
      // da folha em branco; a integridade de cada linha já vem do `cantSplit`.
      const { keepNext: _keepNext, ...dataCellParagraph } = style.paragraph;
      const row = (cells: RichText[], bold: boolean) =>
        new TableRow({
          // `tableHeader` é o que faz o Word repetir a primeira linha no topo de
          // cada página em que a tabela continua (negrito não repete nada);
          // `cantSplit` impede que a linha seja partida ao meio pela virada de
          // folha, o mesmo contrato do `wrap={false}` no PDF (0602/0603).
          // `tableHeader: false` ainda emite a tag (a lib só checa `undefined`),
          // o que marcaria TODA linha como cabeçalho — daí o spread condicional.
          ...(bold ? { tableHeader: true } : {}),
          cantSplit: true,
          children: cells.map(
            (cell) =>
              new TableCell({
                children: [
                  new Paragraph({
                    ...(bold ? style.paragraph : dataCellParagraph),
                    ...spacingWith(lineFor(style.run.size)),
                    children: richTextToRuns(cell, { ...style.run, bold }),
                  }),
                ],
              }),
          ),
        });
      // Achado 0605: sem `columnWidths` a lib emite `<w:gridCol w:w="100"/>`
      // (100 twips = 1,76mm) por coluna, uma grade que não descreve o próprio
      // conteúdo — o Word salva no autofit e disfarça, mas quem respeita a grade
      // declarada (conversores, Google Docs, layout fixo) desenha colunas de
      // 1,76mm. A grade vai com a largura útil da folha dividida igualmente,
      // pelo número de colunas da linha MAIS LARGA (é quantas `gridCol` o
      // arquivo precisa ter).
      const columns = Math.max(...answer.rows.map((cells) => cells.length));
      const column = Math.floor(DOCX_CONTENT_WIDTH_TWIPS / columns);
      const columnWidths = Array.from({ length: columns }, (_, i) =>
        // O resto da divisão vai na última coluna: a soma tem que fechar com a
        // largura útil, senão a grade volta a descrever uma folha que não existe.
        i === columns - 1 ? DOCX_CONTENT_WIDTH_TWIPS - column * (columns - 1) : column,
      );
      return [
        new Table({
          width: { size: 100, type: WidthType.PERCENTAGE },
          columnWidths,
          // Achado 0268: sem `w:tblCellMar` o Word usa o default dele (108 twips
          // dos lados, 0 em cima/embaixo) e quebra a célula uma palavra antes da
          // folha, da prévia e do PDF; o recuo vem do mesmo ponto único (3pt).
          margins: TABLE_CELL_MARGINS,
          borders: TABLE_RULE_BORDERS,
          rows: [row(header, true), ...body.map((cells) => row(cells, false))],
        }),
      ];
    }
  }
}

export function blockToDocxParagraphs(
  block: Block,
  number: number,
  blockGapTwips: number = DEFAULT_BLOCK_GAP_TWIPS,
  keepWithNext = false,
): DocxBlock[] {
  // `block.style` projetado no docx: alinhamento em todo parágrafo do bloco,
  // `spacingAfter` só no último, cor/corpo/fonte herdados pelos runs. Sem
  // `spacingAfter`, o último parágrafo leva o vão do documento, como o
  // `blockGap` do PDF (achado 0269).
  const { paragraph: ownPara, spacing: ownSpacing, run } = nodeStyleToDocx(block.style);
  // Bloco dentro de uma questão (stem): cada parágrafo dele anda com o seguinte.
  const para: ParagraphStyle = keepWithNext ? { ...ownPara, ...KEEP_WITH_NEXT } : ownPara;
  // Corpo próprio do bloco: a linha dele vai em todo parágrafo (achado 0518).
  const line = lineFor(run.size);
  const lineOnly = spacingWith(line);
  const spacing: { spacing: LineSpacing & { after: number } } = {
    spacing: { ...line, ...(ownSpacing.spacing ?? { after: blockGapTwips }) },
  };

  switch (block.type) {
    case "heading": {
      const level =
        block.level === 1
          ? HeadingLevel.HEADING_1
          : block.level === 2
            ? HeadingLevel.HEADING_2
            : HeadingLevel.HEADING_3;
      // O `heading:` fica (é ele que alimenta o painel de navegação e o sumário
      // do Word), mas o estilo do run vai explícito: sozinho, o `Heading1` da
      // lib pinta o título de azul #2E74B5, em 16pt e SEM negrito — a única
      // linha do documento que perdia o peso, contra preto/negrito/18pt no PDF
      // e nas duas telas (achado 0164). Run vence styleId.
      return [
        new Paragraph({
          heading: level,
          ...para,
          spacing: { ...lineSpacing(run.size ?? Math.round(HEADING_PT[block.level] * 2)), ...spacing.spacing },
          children: richTextToRuns(block.content, {
            bold: true,
            color: DOCX_INK,
            size: Math.round(HEADING_PT[block.level] * 2),
            // O `block.style` vence os defaults do título (achado 0134).
            ...run,
          }),
        }),
      ];
    }

    case "paragraph":
      return [new Paragraph({ ...para, ...spacing, children: richTextToRuns(block.content, run) })];

    case "blockMath":
      return [
        new Paragraph({
          alignment: AlignmentType.CENTER,
          ...para,
          ...spacing,
          children: [
            // Mesma regra do inline: o LaTeX, nunca o `alt` (achado 0803).
            new TextRun({ ...run, text: latexLayoutAtom(block.latex), font: MATH_FONT }),
          ],
        }),
      ];

    case "image": {
      // The picture itself is not embedded (see docxExportWarnings). Leaving a
      // labelled placeholder means the teacher can see WHERE it belonged
      // instead of finding a hole where a figure used to be.
      const label = block.alt?.trim() ? `[Imagem: ${block.alt.trim()}]` : "[Imagem]";
      const hasCaption = block.caption !== undefined && block.caption.length > 0;
      // `ImageBlock.alignment` vive FORA do `NodeStyle` e é o que os botões de
      // alinhar do chrome da imagem gravam; o Word era a única superfície que o
      // descartava (achado 0343). Como no PDF (`IMAGE_ALIGN` em PdfLeafBlocks),
      // ele vence o `align` do bloco e vale para a marcação e para a legenda.
      const imagePara: ParagraphStyle = block.alignment
        ? { ...para, alignment: ALIGNMENT[block.alignment] }
        : para;
      const paragraphs: DocxBlock[] = [
        new Paragraph({
          ...imagePara,
          ...(hasCaption ? lineOnly : spacing),
          children: [new TextRun({ ...run, text: label, italics: true })],
        }),
      ];
      if (hasCaption) {
        paragraphs.push(
          // A legenda é texto secundário, como na folha, na prévia e no PDF
          // (`ELEMENT_FONT_RATIOS.caption`): sem tamanho próprio ela saía no
          // corpo do enunciado e deixava de se ler como legenda (achado 0333).
          // O tamanho que a professora escolheu no bloco continua vencendo.
          new Paragraph({
            ...imagePara,
            spacing: { ...lineSpacing(run.size ?? CAPTION_SIZE), ...spacing.spacing },
            children: richTextToRuns(block.caption!, { ...run, size: run.size ?? CAPTION_SIZE }),
          }),
        );
      }
      return paragraphs;
    }

    case "scaffolding":
      // Caixa rotulada, como PdfScaffolding a desenha: o rótulo é a única coisa
      // que nomeia o bloco no impresso (achado 0155) e a moldura é o que separa
      // os passos do corpo das questões (achado 0163).
      return [
        new Paragraph({
          ...SCAFFOLDING_BOX,
          ...para,
          spacing: {
            ...lineSpacing(CAPTION_SIZE),
            ...(block.items.length > 0 ? {} : { after: spacing.spacing.after }),
          },
          children: [
            new TextRun({
              ...run,
              text: SCAFFOLDING_LABEL.toUpperCase(),
              bold: true,
              size: CAPTION_SIZE,
            }),
          ],
        }),
        ...block.items.map(
          (item, i) =>
            new Paragraph({
              ...SCAFFOLDING_BOX,
              ...para,
              ...(i === block.items.length - 1 ? spacing : lineOnly),
              children: [new TextRun({ ...run, text: `${i + 1}. ${item}` })],
            }),
        ),
      ];

    case "divider":
      // Régua de verdade, não texto: `w:pBdr` é a mesma primitiva que a caixa do
      // andaime já usa aqui. Antes saíam 40 U+2500 num parágrafo sem `w:pPr` —
      // largura refém do avanço do glifo (curta e alinhada à esquerda, onde as
      // outras três superfícies varrem a coluna inteira), texto editável e
      // reflowável, dependente de a fonte ter o glifo, e lido pelo leitor de
      // tela (achado 0168).
      return [new Paragraph({ ...DIVIDER_RULE, ...para, ...spacing, children: [] })];

    case "question": {
      const label = block.customNumber ?? String(number);
      const position = block.enunciadoPosition ?? "below";
      // Partes da questão: todas presas à seguinte; só o fecho usa `para`.
      const kept: ParagraphStyle = { ...para, ...KEEP_WITH_NEXT };
      const keptInherited: InheritedStyle = { paragraph: kept, run };
      const hasEnunciado = block.enunciado != null && block.enunciado.length > 0;
      const enunciado = hasEnunciado
        ? [
            new Paragraph({
              ...kept,
              children: richTextToRuns(block.enunciado!, run),
              spacing: { ...line, after: QUESTION_PART_GAP_TWIPS },
            }),
          ]
        : [];

      // The stem is a list of BLOCKS (it can hold images, math, nested
      // questions). Only paragraphs used to survive, so anything else in a stem
      // vanished from the Word file.
      const [first, ...restStem] = block.stem;
      const firstRuns = first?.type === "paragraph" ? richTextToRuns(first.content, run) : [];
      // O primeiro parágrafo do stem viaja no parágrafo do número: leva o vão
      // interno da questão (ou o `spacingAfter` dele), como no PDF.
      const firstSpacing = spacingWith(
        line,
        first?.type === "paragraph"
          ? {
              after:
                nodeStyleToDocx(first.style).spacing.spacing?.after ?? QUESTION_INNER_GAP_TWIPS,
            }
          : {},
      );
      const numbered = new Paragraph({
        ...kept,
        ...firstSpacing,
        children: [new TextRun({ ...run, text: `${label}. `, bold: true }), ...firstRuns],
      });
      const stemRest = (first?.type === "paragraph" ? restStem : block.stem).flatMap((child) =>
        blockToDocxParagraphs(child, 1, QUESTION_INNER_GAP_TWIPS, true),
      );

      return [
        ...(position === "above" ? enunciado : []),
        numbered,
        ...stemRest,
        ...(position === "below" ? enunciado : []),
        ...(block.instruction
          ? [
              new Paragraph({
                ...kept,
                spacing: { ...lineSpacing(run.size ?? SUB_SIZE), after: QUESTION_PART_GAP_TWIPS },
                children: richTextToRuns(block.instruction, {
                  ...run,
                  italics: true,
                  size: run.size ?? SUB_SIZE,
                }),
              }),
            ]
          : []),
        ...answerToDocx(block.answer, keptInherited),
        // O parágrafo que fecha a questão é o último do bloco: é nele que o
        // `spacingAfter` do `block.style` cabe (achado 0134). Vazio, ele já
        // ocupa uma linha; com a altura EXATA do vão, a questão fecha com o
        // mesmo respiro do PDF, e não uma linha de texto inteira (achado 0269).
        new Paragraph({
          ...para,
          spacing: {
            line: Math.max(spacing.spacing.after, 1),
            lineRule: LineRuleType.EXACT,
            after: 0,
          },
          children: [],
        }),
      ];
    }
  }
}

export function headerParagraphs(header: DocumentHeader): Paragraph[] {
  const title = header.title?.trim() ?? "";
  const school = header.school?.trim() ?? "";
  const teacher = header.teacher?.trim() ?? "";
  // A data vai pelo MESMO formatador da prévia, do PDF e do "Copiar": sem ele,
  // só o Word imprimia o valor cru do `<input type="date">` (2026-08-18) numa
  // prova que nenhuma tela do app mostrou assim (achado 0133).
  const date = header.date?.trim() ? formatHeaderDateBR(header.date.trim()) : "";

  if (!title && !school && !teacher && !date) return [];

  const blocks: NonNullable<ConstructorParameters<typeof Paragraph>[0]>[] = [];

  if (title) {
    blocks.push({
      alignment: AlignmentType.CENTER,
      spacing: lineSpacing(HEADER_TITLE_HALF_PT),
      children: [new TextRun({ text: title, bold: true, size: HEADER_TITLE_HALF_PT })],
    });
  }
  if (school) {
    blocks.push({
      alignment: AlignmentType.CENTER,
      spacing: { ...lineSpacing(HEADER_SCHOOL_HALF_PT), before: ptToTwip(HEADER_SPACING_PT.schoolTop) },
      children: [new TextRun({ text: school, size: HEADER_SCHOOL_HALF_PT })],
    });
  }
  if (teacher || date) {
    // Professor(a) e Data dividem UMA linha nos extremos opostos: o que no PDF
    // é `justifyContent: space-between` aqui é uma parada de tabulação à
    // direita, o equivalente do Word.
    const meta: TextRun[] = [];
    if (teacher)
      meta.push(new TextRun({ text: `Professor(a): ${teacher}`, size: HEADER_META_HALF_PT }));
    meta.push(new TextRun({ children: [new Tab()], size: HEADER_META_HALF_PT }));
    if (date) meta.push(new TextRun({ text: `Data: ${date}`, size: HEADER_META_HALF_PT }));
    blocks.push({
      tabStops: [{ type: TabStopType.RIGHT, position: TabStopPosition.MAX }],
      spacing: {
        ...lineSpacing(HEADER_META_HALF_PT),
        before: ptToTwip(HEADER_SPACING_PT.metaTop),
        after: ptToTwip(HEADER_SPACING_PT.bottomPadding),
      },
      children: meta,
    });
  }

  // A régua fica na ÚLTIMA linha do cabeçalho, seja ela qual for — no PDF ela é
  // a borda do bloco inteiro, e o bloco encolhe com os campos vazios.
  blocks[blocks.length - 1] = { ...blocks[blocks.length - 1], ...HEADER_RULE };

  return [
    ...blocks.map((options) => new Paragraph(options)),
    // O separador entre cabeçalho e conteúdo sai JUNTO com o cabeçalho: emitido
    // solto na seção, ele sobrevivia ao cabeçalho vazio (o estado padrão do
    // Passo 6) e o .docx abria com uma linha em branco no topo, enquanto o PDF e
    // a prévia começam colados na margem superior (achado 0426).
    new Paragraph({ children: [] }),
  ];
}

/**
 * What the .docx will NOT carry faithfully.
 *
 * The panel shows this BEFORE downloading. The bug this closes is not that Word
 * is lossy — some loss is unavoidable — but that the app claimed "Word gerado!"
 * over it, so the teacher only discovered the hole in front of the class.
 */
export function docxExportWarnings(
  document: CanonicalDocument,
  pageStyle?: PageStyle,
): string[] {
  const blocks = everyBlock(document.blocks);
  // Item de resposta vazio: a mesma frase do PDF (achado 1105).
  const warnings: string[] = emptyItemWarnings(document);

  if (blocks.some((b) => b.type === "image")) {
    warnings.push(
      "As imagens não são embutidas no Word: cada uma vira uma marcação [Imagem] no lugar.",
    );
  }

  // A varredura de math (inline em qualquer campo RichText, mais blockMath) é
  // a mesma do PDF e mora em `exportWarnings`.
  if (documentHasMath(document)) {
    warnings.push(...mathLossWarnings(document));
    // A fonte da fórmula é `MATH_FONT`, constante, e não a do documento: a
    // mesma perda do PDF, e a mesma frase (achado 0415).
    warnings.push(MATH_TYPOGRAPHY_WARNING);
  }

  const family = pageStyle?.fontFamily;
  if (family && isFontFamilyToken(family) && DOCX_NON_STANDARD_FONTS.includes(family)) {
    warnings.push(
      `A fonte ${fontFamilyToDocx(family)} precisa estar instalada no computador que abrir o arquivo; ` +
        "sem ela, o Word troca por outra fonte.",
    );
  }

  return warnings;
}

/**
 * The document-wide run style from "Aparência" — the accessibility font and body
 * size, which are the whole point of the feature and used to stop at the panel
 * because downloadDocx never accepted pageStyle.
 *
 * Lives out here, and not inline in `downloadDocx`, because that function is
 * `v8 ignore`d for its DOM side effects — the mapping would ship with no test.
 *
 * Sem `pageStyle` (o caso normal, já que nada grava esse campo até o professor
 * abrir o popover "Formato"), cai no MESMO default resolvido que a tela e o PDF
 * usam (`DEFAULT_FONT_FAMILY_TOKEN` / `BASE_FONT_PT`, ou seja Arial 12pt no
 * Word). Devolver `{}` deixava `<w:rPrDefault/>` vazio e entregava o documento
 * ao default do Word do leitor (Calibri 11pt/Aptos), a única das três
 * superfícies sem a tipografia decidida no projeto (achado 0332).
 */
export function documentRunStyle(pageStyle?: PageStyle): {
  font: string;
  size: number;
  color: string;
  language: { value: string };
} {
  return {
    font: fontFamilyToDocx(pageStyle?.fontFamily ?? DEFAULT_FONT_FAMILY_TOKEN),
    // docx measures type size in half-points, so 14pt is 28.
    size: Math.round((pageStyle?.fontSize ?? BASE_FONT_PT) * 2),
    // Sem `color` o `<w:rPrDefault>` saía sem `<w:color>` e o corpo herdava o
    // preto do Word, contra `DEFAULT_INK` nas outras superfícies (achado 0166).
    color: DOCX_INK,
    // Achado 0344: sem `w:lang` o arquivo saía sem idioma nenhum, e o Word
    // aplicava o da instalação — corretor ortográfico e hifenização errando o
    // português inteiro, e o leitor de tela lendo pt-BR com a pronúncia de
    // outro idioma (WCAG 3.1.1). O PDF já sai marcado (achado 0310).
    language: { value: DOCUMENT_LANGUAGE },
  };
}

/**
 * Os estilos padrão do `.docx`: o run de `documentRunStyle` e a entrelinha do
 * corpo.
 *
 * Achado 0269: só o run ia, então o `<w:pPrDefault/>` saía vazio e o Word caía
 * na entrelinha simples, contra `BASE_LINE_HEIGHT` (1,4) no PDF e nas telas.
 * Achado 0518: a entrelinha vai ABSOLUTA, `corpo x 1,4` (ver `lineSpacing`); o
 * `lineRule` auto do 0269 multiplicava a métrica da fonte, não o corpo.
 */
export function docxDocumentStyles(pageStyle?: PageStyle) {
  const run = documentRunStyle(pageStyle);
  return {
    default: {
      document: {
        run,
        paragraph: { spacing: lineSpacing(run.size) },
      },
    },
  };
}

/**
 * Os metadados do `.docx` (`docProps/core.xml`).
 *
 * Achado 0344: o `new Document(...)` ia só com `styles` e `sections`, então o
 * arquivo saía assinado **"Un-named"** — o default da lib `docx`, e texto
 * VISÍVEL: é o "Autor" da janela Propriedades do Word, da coluna Autor do
 * Explorer e do card do arquivo no Drive/Teams. Sem `<dc:title>`, o Word e o
 * leitor de tela anunciam o arquivo pelo nome do arquivo, embora o documento já
 * tenha título. Mesmo defeito que a 0310 consertou no PDF, na outra superfície.
 *
 * Mora fora de `downloadDocx` (que é `v8 ignore` pelos efeitos de DOM) para
 * nascer com teste, como `documentRunStyle` e `docxSectionProperties`.
 */
export function documentMetadata(
  header: DocumentHeader,
  doc?: CanonicalDocument,
): {
  title: string;
  creator: string;
  lastModifiedBy: string;
  description: string;
} {
  // Mesma cadeia que o `<Document title>` do PDF usa (AdaptationPdf.tsx).
  //
  // Achado 0192: parava no genérico porque `documentMetadata` só recebia o
  // header — e o header nasce vazio, com o título do documento só como
  // placeholder no passo Exportar. O `.docx` dizia "Atividade adaptada" em
  // `dc:title` (o que o Word mostra em Propriedades) enquanto imprimia o
  // heading no topo. Com o documento em mãos, cai na derivação da tela:
  // header → heading → genérico.
  const title = header.title?.trim() || (doc ? documentTitle(doc) : FALLBACK_TITLE);
  // Quem assina é o professor do cabeçalho; sem ele, o produto. Nunca a lib.
  const creator = header.teacher?.trim() || PRODUCT_NAME;
  return {
    title,
    creator,
    lastModifiedBy: creator,
    description: `Atividade adaptada no ${PRODUCT_NAME}.`,
  };
}

/**
 * Prende uma quebra de página REAL ao início do bloco.
 *
 * A quebra vai como primeiro run do primeiro parágrafo (e não como um parágrafo
 * solto só com a quebra), senão o Word abriria cada página nova com uma linha
 * vazia que o PDF não tem. Quando o bloco começa por uma tabela — que não aceita
 * run —, aí sim entra um parágrafo dedicado.
 */
export function withPageBreak(blocks: DocxBlock[]): DocxBlock[] {
  const [first] = blocks;
  if (first instanceof Paragraph) {
    first.addRunToFront(new PageBreak());
    return blocks;
  }
  return [new Paragraph({ children: [new PageBreak()] }), ...blocks];
}

/**
 * O corpo do .docx: os blocos do documento já com a numeração das questões e as
 * quebras de página.
 *
 * Mora fora de `downloadDocx` (que é `v8 ignore` pelos efeitos de DOM) porque é
 * exatamente aqui que estava o achado 0132: o switch "Quebra de página por
 * questão" chegava à prévia, ao PDF e ao "Copiar" e sumia no Word — o arquivo
 * saía num fluxo contínuo, sem nenhum `<w:br w:type="page"/>`. A derivação é a
 * mesma `perQuestionBreakFlags` que a prévia e o PDF leem, e o
 * `style.pageBreakBefore` do nó canônico (que o PDF já honra) também entra.
 */
export function docxContentBlocks(
  document: CanonicalDocument,
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
  pageStyle?: PageStyle,
): DocxBlock[] {
  const breaks = perQuestionBreakFlags(document.blocks);
  // O mesmo `blockSpacing` (px) que o PDF converte em `blockGap` (achado 0269).
  const blockGapTwips = pxToTwips(pageStyle?.blockSpacing ?? BASE_BLOCK_SPACING_PX);
  let questionIndex = 0;
  return document.blocks.flatMap((block, i) => {
    if (block.type === "question") questionIndex++;
    const paragraphs = blockToDocxParagraphs(block, questionIndex, blockGapTwips);
    const forceBreak =
      (settings.pageBreakPerQuestion && breaks[i]) || block.style?.pageBreakBefore === true;
    return forceBreak ? withPageBreak(paragraphs) : paragraphs;
  });
}

/**
 * As propriedades da seção do .docx — hoje só a margem da página.
 *
 * Achado 0331: a seção ia sem `properties`, então valia a margem default da lib
 * `docx` (1440 twips = 1 polegada = 72pt), contra os 40pt de `PAGE_MARGIN_PT`
 * que o PDF e as duas telas usam. Mesma folha A4, coluna 12,4% mais estreita
 * (451,28pt contra 515,28pt): como a quebra de linha e a paginação dependem da
 * largura útil, o documento inteiro reflowa entre a prévia aprovada e o arquivo
 * que o professor abre no Word.
 *
 * Mora fora de `downloadDocx` (que é `v8 ignore` pelos efeitos de DOM) para
 * nascer com teste, como `documentRunStyle` e `docxContentBlocks`.
 */
/**
 * Largura útil da folha A4 no .docx, em twips (1pt = 20 twips).
 *
 * A4 tem 595pt de largura (o mesmo `size="A4"` do react-pdf) e `PAGE_MARGIN_PT`
 * sai de cada lado, a margem que `docxSectionProperties` escreve na seção.
 */
export const DOCX_CONTENT_WIDTH_TWIPS = Math.round((595 - 2 * PAGE_MARGIN_PT) * 20);

export function docxSectionProperties(): {
  page: { margin: { top: number; right: number; bottom: number; left: number } };
} {
  // O Word mede a página em twips: 1pt = 20 twips, logo 40pt = 800.
  const margin = Math.round(PAGE_MARGIN_PT * 20);
  return { page: { margin: { top: margin, right: margin, bottom: margin, left: margin } } };
}

/**
 * O rodapé de TODA página do .docx.
 *
 * Achado 0334: a seção ia sem `footers`, então o Word era a única das três
 * saídas em que a folha sai sem nada que a identifique nem diga quantas são —
 * exatamente a saída que o professor imprime em lote. O `PdfPageFooter` e a
 * prévia já desenham esse pé.
 *
 * O texto não pode ser a string do `pdfFooterLabel`: quem pagina o .docx é o
 * Word, então os números vão como CAMPOS (`PAGE` / `NUMPAGES`) que ele resolve
 * ao abrir. O prefixo título/escola, esse sim, reusa `footerPrefixParts`, a
 * mesma regra de descarte de vazios das outras superfícies.
 *
 * Mora fora de `downloadDocx` (que é `v8 ignore` pelos efeitos de DOM) para
 * nascer com teste, como `documentRunStyle` e `docxSectionProperties`.
 */
export function docxFooter(header: DocumentHeader): Footer {
  const style = { size: Math.round(FOOTER_FONT_SIZE_PT * 2), color: FOOTER_COLOR.slice(1) };
  const prefix = footerPrefixParts(header).map(
    (part) => new TextRun({ ...style, text: `${part}${FOOTER_SEPARATOR}` }),
  );
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.CENTER,
        children: [
          ...prefix,
          new TextRun({ ...style, text: "Página " }),
          new TextRun({ ...style, children: [PageNumber.CURRENT] }),
          new TextRun({ ...style, text: " de " }),
          new TextRun({ ...style, children: [PageNumber.TOTAL_PAGES] }),
        ],
      }),
    ],
  });
}

/* v8 ignore start */
export async function downloadDocx(
  document: CanonicalDocument,
  settings: PanelSettings = DEFAULT_PANEL_SETTINGS,
  pageStyle?: PageStyle,
): Promise<void> {
  const header = settings.header;
  const contentParagraphs = docxContentBlocks(document, settings, pageStyle);

  const doc = new Document({
    ...documentMetadata(header, document),
    styles: docxDocumentStyles(pageStyle),
    sections: [
      {
        properties: docxSectionProperties(),
        footers: { default: docxFooter(header) },
        children: [...headerParagraphs(header), ...contentParagraphs],
      },
    ],
  });

  const blob = await Packer.toBlob(doc);
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement("a");
  link.href = url;
  link.download = docxFileName(header, document);
  window.document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
/* v8 ignore stop */
