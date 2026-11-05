/**
 * PdfAnswer — PDF analogue of AnswerView/AnswerPreview. Dispatches a canonical
 * `QuestionAnswer` to a react-pdf projection per kind.
 *
 * Gabarito (chave de respostas) está OCULTO — espelha AnswerPreview (D5):
 *   - multipleChoice: alternativas com letras a)/b)/…, SEM ✔ na correta
 *   - trueFalse: afirmação + marcadores vazios "( ) V ( ) F", SEM revelar o valor
 *   - checkbox: caixa vazia DESENHADA para TODOS os itens, SEM marca (0358)
 *   - matching: left e right ligados por uma seta DESENHADA (pareamento é a
 *                estrutura, não o gabarito) — ver `paintMatchingLink` (0444)
 *   - ordering: array na ordem original (SEM sort por position, SEM numeração)
 *                marcador ____ para o aluno escrever a ordem
 *   - fillBlank: <View/> vazio — as lacunas vivem inline no enunciado
 *   - table: cabeçalho em negrito, corpo normal — mantido (formatação, não gabarito)
 *   - open: linhas pautadas em branco (padrão: 3)
 *
 * O discriminante `kind` é exaustivo sobre a união tipada — sem default.
 */

import { View, Text, Canvas } from "@react-pdf/renderer";
import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { indexToLetter } from "../letters";
import { MONO_ADVANCE_EM } from "../mathAtom";
import { PdfRichText } from "./PdfRichText";
import { shareColumnPt } from "./columnWidth";
import { headerNeedsRelease, tableCellColumnPt, tableRowBands } from "./tableRowFit";
import { KEEP_PAGE_PT, keepTogether } from "./keepTogether";
import { mathPdfInlineStyle } from "./mathToPdfText";
import { resolveElementFontSizes, resolvePageStyle, type ElementFontSizesPt } from "../pageStyle";
import {
  ANSWER_LINE_COLOR,
  ANSWER_LINE_GAP_PT,
  ANSWER_LINE_WIDTH_PT,
  ANSWER_LINE_DASH_PT,
  ANSWER_LINE_DASH_SPACE_PT,
  ANSWER_ITEM_GAP_PT,
  BASE_LINE_HEIGHT,
  alternativeMarkerColumnPt,
  ALTERNATIVE_MARKER_GAP_PT,
  MATCHING_LINK_GAP_PT,
  BASE_FONT_PT,
  pdfTextSize,
  TABLE_CELL_PADDING_PT,
  TRUE_FALSE_MARKER_GAP_PT,
  TRUE_FALSE_MARKER_TEXT,
  RULE_COLOR,
  RULE_WIDTH_PT,
  CHECKBOX_BOX_PT,
  CHECKBOX_BOX_BORDER_PT,
  CHECKBOX_BOX_RADIUS_PT,
  CHECKBOX_BOX_COLOR,
  mathPdfFontSizePt,
} from "../pageTokens";

// O vão entre itens vem de pageTokens para o papel imprimir o mesmo passo que as
// duas telas mostram (achado 0313). Ele vale só ENTRE itens, como o `rowGap` das
// telas (achado 0707): o último item sai sem margem. O @react-pdf soma o
// `marginBottom` do último filho na conta de virada de página, e a sobra mandava
// a última alternativa sozinha para a folha seguinte mesmo cabendo nesta.
const ROW = { flexDirection: "row", marginBottom: ANSWER_ITEM_GAP_PT } as const;
const LAST_ROW = { flexDirection: "row" } as const;
const rowStyle = (index: number, count: number) => (index < count - 1 ? ROW : LAST_ROW);
// A COLUNA do marcador tem largura fixa (22pt na base de 12pt), em qualquer fonte: é ela
// que alinha o texto das alternativas com a tela. O TEXTO do marcador, porém, nunca pode
// ceder à coluna (achado I1, lote 4b): na OpenDyslexic, larga, o `b)` mais o espaço
// fantasma (`markerGhost`) passava da caixa e o textkit o quebrava com hífen (`b-` / `)`);
// `m)` quebra sozinho a partir de 22pt, e `aa)` em toda fonte. Então a coluna é uma <View>
// de largura fixa (`flexShrink: 0`, sem clipe) e o <Text> dentro dela é largo o bastante
// para o marcador nunca precisar de segunda linha, transbordando sem tinta para o vão.
// A largura do Text não mexe em coluna nenhuma: quem o mede é a View.
const MARKER_TEXT_ROOM = 4;
const markerColumnStyle = (fontSizePt: number) =>
  ({
    width: alternativeMarkerColumnPt(fontSizePt),
    flexShrink: 0,
  }) as const;
const markerStyle = (fontSizePt: number) =>
  ({
    ...pdfTextSize(fontSizePt),
    width: alternativeMarkerColumnPt(fontSizePt) * MARKER_TEXT_ROOM,
  }) as const;
// flexBasis: 0 é obrigatório. Sem ele o Yoga deriva a base medindo o texto
// contra a largura CHEIA do pai e só depois encolhe a caixa para caber ao
// lado do marcador: a caixa anda, mas as linhas já foram quebradas na
// medida larga e saem pela margem direita (com o marcador de 60pt do V/F,
// para fora do papel). Com base 0 o Yoga distribui o espaço que sobra
// depois do marcador — o mesmo que PdfQuestion faz com `flex: 1` (0162).
const FLEX = { flexGrow: 1, flexShrink: 1, flexBasis: 0 } as const;

// Marcador de verdadeiro/falso para o aluno assinalar — não revela o valor.
// A coluna é o próprio conteúdo do marcador mais o vão das duas telas, em vez
// da constante de 60pt de antes (achado 0359): o glifo mede 58,008pt na base de
// 12pt, sobravam 1,99pt e o `F` colava na primeira palavra da afirmação; acima
// do padrão do popover Formato o texto passava da caixa e quebrava, como no
// achado 0182. Sem `width`, o Yoga mede o marcador (uma linha) e `flexShrink: 0`
// garante que ele não ceda — a coluna escala sozinha com corpo e família.
const TF_MARKER = { marginRight: TRUE_FALSE_MARKER_GAP_PT, flexShrink: 0 } as const;

// Marcador da ORDENAÇÃO: coluna própria, medida pelo glifo que ele imprime, em
// vez da coluna do `a)` (achado 0449). `alternativeMarkerColumnPt` é calibrada
// para o ordinal da alternativa — 22pt na base de 12pt, dos quais só 16pt são
// glifo. O `____` avança 0,5em por `_`, ou seja 24pt na mesma base: mais largo
// que a coluna inteira. Com `flexShrink: 0` a caixa não cedia, o texto
// transbordava para dentro da coluna do conteúdo e o vão sumia — o papel
// imprimia `____Evaporacao`, com o traço por baixo das primeiras letras, sem
// fim visível para o aluno escrever o número. Como a coluna escala com o corpo
// mas a proporção 24/22 não muda, valia em TODO tamanho de texto. A solução é a
// do marcador V/F (achado 0359): sem `width`, o Yoga mede o próprio marcador e
// o vão vem do `marginRight`, então a coluna escala sozinha com corpo e família.
const ORDERING_MARKER = { marginRight: ALTERNATIVE_MARKER_GAP_PT, flexShrink: 0 } as const;

/**
 * Marcador na linha de base do item que abre com fórmula (achado 0391).
 *
 * O marcador é um <Text> IRMÃO da coluna do item, alinhado pelo topo: a linha de
 * base de cada um é o topo da linha mais a maior ascendente dos seus runs. Quando
 * o item abre com fórmula inline, o run de Courier (maior que o corpo) aumenta a
 * ascendente da primeira linha do item e o texto desce ~4,5pt, enquanto o
 * marcador fica onde estava: na ordenação os traços alternavam de altura dentro
 * da mesma lista. O 0428 resolveu o número da questão levando o número para
 * dentro do <Text> do enunciado, mas aqui isso custaria o recuo pendente (as
 * linhas seguintes do item alinhadas na coluna do conteúdo, como nas telas).
 *
 * Então o marcador ganha um run FANTASMA no mesmo estilo da fórmula: um espaço
 * final, sem tinta, que dá à primeira linha do marcador a mesma ascendente da
 * primeira linha do item. Só quando o item ABRE com fórmula, o único caso em que
 * é certo que a fórmula está na primeira linha (uma fórmula numa linha seguinte
 * não mexe na linha de base do topo). O espaço é monoespaçado, então o avanço é
 * conhecido: a coluna fixa do `a)` o deixa transbordar sem tinta, e as colunas
 * medidas (V/F e ordenação) descontam o avanço do vão para o item não andar.
 */
const opensWithMath = (content: RichText) => content[0]?.type === "inlineMath";
const ghostAdvancePt = (fontSizePt: number) => MONO_ADVANCE_EM * mathPdfFontSizePt(fontSizePt);
const markerGhost = (content: RichText, fontSizePt: number) =>
  opensWithMath(content) ? <Text style={mathPdfInlineStyle(fontSizePt)}> </Text> : null;
/** Vão da coluna medida, descontado o avanço do fantasma quando ele existe. */
const ghostGap = (gapPt: number, content: RichText, fontSizePt: number) => ({
  marginRight: opensWithMath(content) ? gapPt - ghostAdvancePt(fontSizePt) : gapPt,
});

/**
 * Painter mínimo do `Canvas` do @react-pdf (o pacote tipa como `any`): só os
 * comandos que a pauta usa, encadeáveis como no pdfkit.
 */
type AnswerLinePainter = {
  lineWidth: (width: number) => AnswerLinePainter;
  strokeColor: (color: string) => AnswerLinePainter;
  dash: (length: number, options: { space: number }) => AnswerLinePainter;
  moveTo: (x: number, y: number) => AnswerLinePainter;
  lineTo: (x: number, y: number) => AnswerLinePainter;
  stroke: () => AnswerLinePainter;
};

/**
 * A pauta da questão aberta é desenhada à mão, não por `borderBottomStyle:
 * "dashed"`, porque o @react-pdf deriva a cadência do tracejado da espessura da
 * borda (`ctx.dash(w * 2, { space: w * 1.2 })`). Isso deixava o ritmo sem dono:
 * quando o achado 0145 unificou a espessura em 0,75pt, o tracejado encolheu
 * junto e o papel passou a imprimir 56% mais denso que a tela. Com o `Canvas` o
 * dash vem dos tokens, e mexer na espessura não mexe mais no ritmo (achado 0154).
 */
function paintAnswerLine(painter: AnswerLinePainter, availableWidth: number): null {
  const y = ANSWER_LINE_WIDTH_PT / 2;
  painter
    .lineWidth(ANSWER_LINE_WIDTH_PT)
    .strokeColor(ANSWER_LINE_COLOR)
    .dash(ANSWER_LINE_DASH_PT, { space: ANSWER_LINE_DASH_SPACE_PT })
    .moveTo(0, y)
    .lineTo(availableWidth, y)
    .stroke();
  return null;
}

/**
 * O elo da associação é DESENHADO, não escrito (achado 0444).
 *
 * As fontes padrão do `@react-pdf` são as built-in Type 1 do PDF, com encoding
 * WinAnsi (CP1252). A seta dupla da associação (U+2194) não existe nessa
 * tabela: pedir o glifo não levanta erro nenhum, o byte que sobra na
 * codificação vira outro caractere e o aluno recebia `Peixe " Rio`. A tela e o
 * Word imprimem o `\u2194` porque resolvem a fonte na máquina de quem lê; o PDF
 * carrega a sua. Com o `Canvas` o traço vale em qualquer fonte, inclusive nas
 * built-in, e o papel volta a mostrar o que a folha mostra.
 */
type MatchingLinkPainter = {
  lineWidth: (width: number) => MatchingLinkPainter;
  strokeColor: (color: string) => MatchingLinkPainter;
  moveTo: (x: number, y: number) => MatchingLinkPainter;
  lineTo: (x: number, y: number) => MatchingLinkPainter;
  stroke: () => MatchingLinkPainter;
};

/** Comprimento da seta, proporcional ao corpo do item. */
const matchingLinkWidthPt = (fontSizePt: number) => fontSizePt * 0.9;
/** O que o elo (a seta e o vão dos dois lados) tira das duas colunas de texto do pareamento. */
const matchingLinkSpacePt = (fontSizePt: number) => matchingLinkWidthPt(fontSizePt) + 2 * MATCHING_LINK_GAP_PT;
/**
 * O que o marcador de V/F tira do texto da afirmação. O glifo `( ) V ( ) F` mede 4,83 em na
 * base; 6 em cobre as famílias mais largas (OpenDyslexic), e errar para MAIS só parte a fórmula
 * antes do necessário, nunca a corta (N-M-001).
 */
const trueFalseMarkerColumnPt = (fontSizePt: number) => 6 * fontSizePt + TRUE_FALSE_MARKER_GAP_PT;
/** O marcador `____` da ordenação: 4 traços de 0,5 em, com folga, mais o vão. */
const orderingMarkerColumnPt = (fontSizePt: number) => 3 * fontSizePt + ALTERNATIVE_MARKER_GAP_PT;
/** Tamanho de cada ponta, em fração do comprimento. */
const MATCHING_LINK_HEAD_RATIO = 0.31;

function paintMatchingLink(
  painter: MatchingLinkPainter,
  availableWidth: number,
  availableHeight: number,
): null {
  const y = availableHeight / 2;
  // A ponta escala com a largura RECEBIDA (e não com o token) para o desenho
  // continuar proporcional se o Yoga entregar menos espaço que o pedido.
  const head = availableWidth * MATCHING_LINK_HEAD_RATIO;
  painter
    .lineWidth(ANSWER_LINE_WIDTH_PT)
    .strokeColor(ANSWER_LINE_COLOR)
    .moveTo(0, y)
    .lineTo(availableWidth, y)
    .stroke()
    .moveTo(head, y - head)
    .lineTo(0, y)
    .lineTo(head, y + head)
    .stroke()
    .moveTo(availableWidth - head, y - head)
    .lineTo(availableWidth, y)
    .lineTo(availableWidth - head, y + head)
    .stroke();
  return null;
}

/**
 * A caixa do checkbox é DESENHADA, como a pauta e o elo da associação (0358).
 *
 * Escrita, ela virava o texto `[ ]`: o aluno recebia no papel dois colchetes
 * finos onde as duas telas mostram um quadrado fechado de 17px — alvo menor
 * para marcar com X, e a única superfície que o professor NÃO consegue conferir
 * antes de imprimir. O traço é inserido meia espessura para dentro para a caixa
 * medir o lado do token de ponta a ponta, e não meia borda a mais de cada lado.
 */
function paintCheckboxBox(
  painter: CheckboxBoxPainter,
  availableWidth: number,
  availableHeight: number,
): null {
  const inset = CHECKBOX_BOX_BORDER_PT / 2;
  painter
    .lineWidth(CHECKBOX_BOX_BORDER_PT)
    .strokeColor(CHECKBOX_BOX_COLOR)
    .roundedRect(
      inset,
      inset,
      availableWidth - CHECKBOX_BOX_BORDER_PT,
      availableHeight - CHECKBOX_BOX_BORDER_PT,
      CHECKBOX_BOX_RADIUS_PT,
    )
    .stroke();
  return null;
}

type CheckboxBoxPainter = {
  lineWidth: (width: number) => CheckboxBoxPainter;
  strokeColor: (color: string) => CheckboxBoxPainter;
  roundedRect: (x: number, y: number, w: number, h: number, r: number) => CheckboxBoxPainter;
  stroke: () => CheckboxBoxPainter;
};

/** Largura e altura explícitas, pelo mesmo motivo de `ANSWER_LINE_STYLE`. */
const CHECKBOX_BOX_STYLE = {
  width: CHECKBOX_BOX_PT,
  height: CHECKBOX_BOX_PT,
  flexShrink: 0,
} as const;

/**
 * A caixa ocupa a coluna do marcador (a mesma de `a)`), centrada na altura de
 * UMA linha do item para acompanhar o corpo escolhido no popover "Formato" —
 * como o `mt-1` das duas telas faz no corpo padrão.
 */
const checkboxMarkerStyle = (fontSizePt: number) =>
  ({
    width: alternativeMarkerColumnPt(fontSizePt),
    flexShrink: 0,
    paddingTop: Math.max(0, (fontSizePt * BASE_LINE_HEIGHT - CHECKBOX_BOX_PT) / 2),
  }) as const;

/**
 * A caixa da seta ocupa a altura de UMA linha do item (corpo x entrelinha), para
 * o par continuar alinhado pelo topo como as duas colunas de texto. A folga
 * lateral vem de `MATCHING_LINK_GAP_PT`, o ponto único das três superfícies
 * (achado 0197).
 */
const matchingLinkStyle = (fontSizePt: number) =>
  ({
    width: matchingLinkWidthPt(fontSizePt),
    height: fontSizePt * BASE_LINE_HEIGHT,
    marginHorizontal: MATCHING_LINK_GAP_PT,
    flexShrink: 0,
  }) as const;

/** O `Canvas` preenche a caixa do elo; a caixa é quem tem medida. */
const MATCHING_LINK_CANVAS = { width: "100%", height: "100%" } as const;

/**
 * O separador na CAMADA DE TEXTO (achado 0194).
 *
 * O desenho continua sendo a tinta: ele vale em qualquer família, inclusive nas
 * de acessibilidade (Atkinson e Lexend não trazem U+2194). Mas `Canvas` só
 * emite operadores de caminho, nunca um `Tj`, então o arquivo saía sem NADA
 * entre os dois termos: `pdftotext` devolvia `Peixe` e `Rio` colados, e o
 * leitor de tela sobre o PDF perdia o único sinal de que os dois formam um par.
 * Num produto para aluno com barreira de aprendizagem, o PDF é justamente o
 * arquivo com mais chance de passar por leitura assistida.
 *
 * Então o caractere viaja junto, invisível (`opacity: 0`, como a camada de
 * texto de um OCR) e fora do fluxo, para não mudar nem a tinta nem a medida do
 * par. A família é fixa em Liberation Sans, e não a da folha: é o que garante
 * que o glifo exista na fonte embutida e que o `ToUnicode` devolva o caractere
 * certo mesmo quando o professor escolhe Lexend.
 */
const MATCHING_LINK_CHAR = "↔";
const MATCHING_LINK_TEXT_FAMILY = "Liberation Sans";
const matchingLinkTextStyle = (fontSizePt: number) =>
  ({
    ...pdfTextSize(fontSizePt),
    fontFamily: MATCHING_LINK_TEXT_FAMILY,
    position: "absolute",
    top: 0,
    left: 0,
    width: "100%",
    textAlign: "center",
    opacity: 0,
  }) as const;

// Largura e altura explícitas: sem elas o @react-pdf mede o `Canvas` chamando o
// `paint` com um contexto de medição e a linha colapsa.
// Como o `ROW`, o passo da pauta vale só entre linhas (achado 0707).
const LAST_ANSWER_LINE_STYLE = { width: "100%", height: ANSWER_LINE_WIDTH_PT } as const;
const ANSWER_LINE_STYLE = { ...LAST_ANSWER_LINE_STYLE, marginBottom: ANSWER_LINE_GAP_PT } as const;

/**
 * Default sizes for callers that render an answer standalone. Resolving them
 * (instead of inheriting whatever the page sets) keeps this component's output
 * identical to the historical one at the 12pt base.
 */
const DEFAULT_ELEMENT_SIZES = resolveElementFontSizes(resolvePageStyle());

export function PdfAnswer({
  answer,
  elementSizes = DEFAULT_ELEMENT_SIZES,
  baseFontSize = BASE_FONT_PT,
}: {
  answer: QuestionAnswer;
  elementSizes?: ElementFontSizesPt;
  /** Corpo do documento (pt): contexto da fórmula nas células da tabela (0402). */
  baseFontSize?: number;
}) {
  // Alternatives / items / cells all read at the "alternative" size, which
  // follows the document font size (see resolveElementFontSizes).
  const itemStyle = pdfTextSize(elementSizes.alternative);
  const MARKER = markerStyle(elementSizes.alternative);
  const MARKER_COLUMN = markerColumnStyle(elementSizes.alternative);
  // How wide the text of each kind of item really is (N-M-001): the sheet minus what sits beside it.
  const markerItemColumn = shareColumnPt(undefined, { minus: alternativeMarkerColumnPt(elementSizes.alternative) });
  const tfColumn = shareColumnPt(undefined, { minus: trueFalseMarkerColumnPt(elementSizes.alternative) });
  const orderingColumn = shareColumnPt(undefined, { minus: orderingMarkerColumnPt(elementSizes.alternative) });
  const matchingColumn = shareColumnPt(undefined, { minus: matchingLinkSpacePt(elementSizes.alternative), parts: 2 });
  const cellColumn = tableCellColumnPt;
  switch (answer.kind) {
    case "open": {
      const lines = answer.answerLines ?? 3;
      return (
        <View>
          {Array.from({ length: lines }, (_, i) => (
            <Canvas
              key={i}
              style={i < lines - 1 ? ANSWER_LINE_STYLE : LAST_ANSWER_LINE_STYLE}
              paint={paintAnswerLine}
            />
          ))}
        </View>
      );
    }
    case "multipleChoice":
      return (
        <View>
          {keepTogether(KEEP_PAGE_PT)}
          {answer.alternatives.map((alt, i, all) => (
            <View key={alt.id} style={rowStyle(i, all.length)}>
              <View style={MARKER_COLUMN}>
                <Text style={MARKER}>
                  {indexToLetter(i)})
                  {markerGhost(alt.content, elementSizes.alternative)}
                </Text>
              </View>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={alt.content} fontSize={elementSizes.alternative} columnPt={markerItemColumn} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "trueFalse":
      return (
        <View>
          {keepTogether(KEEP_PAGE_PT)}
          {answer.items.map((item, i, all) => (
            <View key={item.id} style={rowStyle(i, all.length)}>
              <Text
                style={{
                  ...TF_MARKER,
                  ...ghostGap(TRUE_FALSE_MARKER_GAP_PT, item.content, elementSizes.alternative),
                }}
              >
                {TRUE_FALSE_MARKER_TEXT}
                {markerGhost(item.content, elementSizes.alternative)}
              </Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={item.content} fontSize={elementSizes.alternative} columnPt={tfColumn} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "checkbox":
      return (
        <View>
          {keepTogether(KEEP_PAGE_PT)}
          {answer.items.map((item, i, all) => (
            <View key={item.id} style={rowStyle(i, all.length)}>
              <View style={checkboxMarkerStyle(elementSizes.alternative)}>
                <Canvas style={CHECKBOX_BOX_STYLE} paint={paintCheckboxBox} />
              </View>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={item.content} fontSize={elementSizes.alternative} columnPt={markerItemColumn} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "matching":
      return (
        <View>
          {keepTogether(KEEP_PAGE_PT)}
          {answer.pairs.map((pair, i, all) => (
            <View key={pair.id} style={rowStyle(i, all.length)}>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={pair.left} fontSize={elementSizes.alternative} columnPt={matchingColumn} />
                </Text>
              </View>
              <View style={matchingLinkStyle(elementSizes.alternative)}>
                <Canvas style={MATCHING_LINK_CANVAS} paint={paintMatchingLink} />
                <Text style={matchingLinkTextStyle(elementSizes.alternative)}>
                  {MATCHING_LINK_CHAR}
                </Text>
              </View>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={pair.right} fontSize={elementSizes.alternative} columnPt={matchingColumn} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "ordering":
      return (
        <View>
          {keepTogether(KEEP_PAGE_PT)}
          {answer.items.map((item, i, all) => (
            <View key={item.id} style={rowStyle(i, all.length)}>
              <Text
                style={{
                  ...itemStyle,
                  ...ORDERING_MARKER,
                  ...ghostGap(ALTERNATIVE_MARKER_GAP_PT, item.content, elementSizes.alternative),
                }}
              >
                ____
                {markerGhost(item.content, elementSizes.alternative)}
              </Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={item.content} fontSize={elementSizes.alternative} columnPt={orderingColumn} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "fillBlank":
      // As lacunas vivem inline no enunciado; não há gabarito a exibir aqui.
      // Retorna <View/> vazio (não null) para satisfazer o contrato de paridade.
      return <View />;
    case "table": {
      const [header, ...body] = answer.rows;
      const headerReleased = !!header && headerNeedsRelease(header, baseFontSize, cellColumn(header.length));
      // Simulate border-collapse (Yoga has none): the container draws the top+left
      // edges, each cell draws its right+bottom — so every interior line is drawn
      // once instead of doubled.
      // `flexBasis: 0` is what keeps ONE column grid: with the default `auto`,
      // Yoga sizes each cell from its own content and every row — an
      // independent flex container — lands on its own widths (zig-zag borders).
      const cell = {
        flexGrow: 1,
        flexShrink: 1,
        flexBasis: 0,
        borderRightWidth: RULE_WIDTH_PT,
        borderBottomWidth: RULE_WIDTH_PT,
        borderColor: RULE_COLOR,
        // Recuo e traço vêm de pageTokens: a prévia do Exportar mede o próprio
        // DOM para contar as folhas, então a célula das duas superfícies precisa
        // ter a mesma altura de linha (achado 0607).
        padding: TABLE_CELL_PADDING_PT,
      } as const;
      /**
       * Uma linha da tabela como uma ou mais FAIXAS indivisíveis (L10-1). Linha que cabe numa
       * folha é uma faixa só, `wrap={false}` (0602). Linha mais alta é fatiada por nós em faixas
       * que cabem, cada uma `wrap={false}`: o react-pdf escolhe a folha de cada faixa e nunca
       * parte uma, então nenhuma célula perde texto nem sai da coluna. Nas emendas a célula não
       * tem fio de baixo nem recuo, para ler como uma célula só. Sempre há onde cortar (a fórmula
       * parte em pontos seguros do LaTeX): nenhuma linha do corpo fica para o fatiamento do react-pdf.
       */
      const renderBands = (row: RichText[], isHeader: boolean, key: number | string = "header") => {
        const columnPt = cellColumn(row.length);
        const grid = tableRowBands(row, baseFontSize, columnPt);
        return grid.map((band, j) => {
          const first = j === 0;
          const last = j === grid.length - 1;
          const seamStyle = {
            ...(first ? {} : { paddingTop: 0 }),
            ...(last ? {} : { paddingBottom: 0, borderBottomWidth: 0 }),
          };
          return (
            <View
              key={`${key}-${j}`}
              wrap={false}
              style={{ flexDirection: "row" }}
            >
              {band.map((c, i) => (
                <View key={i} style={{ ...cell, ...seamStyle }}>
                  {(c.length > 0 || grid.length === 1) && (
                    <Text style={isHeader ? { fontWeight: "bold" } : undefined}>
                      <PdfRichText content={c} fontSize={baseFontSize} columnPt={columnPt} />
                    </Text>
                  )}
                </View>
              ))}
            </View>
          );
        });
      };
      return (
        <>
          {/*
            Fio invisível de altura zero que exige, ANTES da tabela, papel para
            o cabeçalho MAIS uma linha de dados (achado 0193). Sem ele o `fixed`
            do cabeçalho desenha a faixa de rótulos sozinha no pé da folha (o
            corpo não cabe e desce) e a repete na folha seguinte. O
            `minPresenceAhead` é ignorado em nó `fixed` e não quebra um nó que
            já vai ser fatiado, então ele mora aqui, num irmão de altura zero
            imediatamente acima da tabela: é esse irmão que o react-pdf empurra
            para a folha seguinte, levando a tabela inteira junto.
          */}
          <View minPresenceAhead={tableLeadPresencePt(baseFontSize)} />
          <View
            style={{
              borderTopWidth: RULE_WIDTH_PT,
              borderLeftWidth: RULE_WIDTH_PT,
              borderColor: RULE_COLOR,
            }}
          >
            {header && headerReleased
              ? renderBands(header, true)
              : header && (
                  // `wrap={false}`: sem isso o react-pdf fatia a linha na virada de
                  // página e deixa a moldura numa folha e o texto na outra (0602).
                  // `fixed`: no react-pdf só o que é fixo reaparece a cada folha em
                  // que o pai continua — é o que repete o cabeçalho e evita a página
                  // com linhas de dados sem rótulo de coluna (0603). Cabeçalho que
                  // ocuparia boa parte da folha (célula gigante) não é fixo: repintado
                  // em toda folha, ele travava o paginador (L9BC-1, `tableRowFit.ts`).
                  <View fixed wrap={false} style={{ flexDirection: "row" }}>
                    {header.map((c, i) => (
                      <View key={i} style={cell}>
                        <Text style={{ fontWeight: "bold" }}>
                          <PdfRichText content={c} fontSize={baseFontSize} columnPt={cellColumn(header.length)} />
                        </Text>
                      </View>
                    ))}
                  </View>
                )}
            {body.map((row, r) => renderBands(row, false, r))}
          </View>
        </>
      );
    }
  }
}

/**
 * Papel que o INÍCIO da tabela pede abaixo do que vem antes dela: o cabeçalho
 * mais uma linha de dados, cada uma de uma só linha de texto (corpo x
 * entrelinha, recuo das duas bordas da célula e o fio de baixo), mais o fio de
 * cima da moldura. Usado pelo guard do 0193 aqui e pelo da questão (0515).
 */
export function tableLeadPresencePt(baseFontSize: number): number {
  const rowHeightPt = baseFontSize * BASE_LINE_HEIGHT + 2 * TABLE_CELL_PADDING_PT + RULE_WIDTH_PT;
  return 2 * rowHeightPt + RULE_WIDTH_PT;
}

export default PdfAnswer;
