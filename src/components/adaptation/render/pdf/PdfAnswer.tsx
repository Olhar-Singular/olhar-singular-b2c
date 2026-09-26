/**
 * PdfAnswer — PDF analogue of AnswerView/AnswerPreview. Dispatches a canonical
 * `QuestionAnswer` to a react-pdf projection per kind.
 *
 * Gabarito (chave de respostas) está OCULTO — espelha AnswerPreview (D5):
 *   - multipleChoice: alternativas com letras a)/b)/…, SEM ✔ na correta
 *   - trueFalse: afirmação + marcadores vazios "(  ) V  (  ) F", SEM revelar o valor
 *   - checkbox: [ ] para TODOS os itens, SEM [x]
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
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { indexToLetter } from "../letters";
import { PdfRichText } from "./PdfRichText";
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
  BASE_FONT_PT,
  pdfTextSize,
  TABLE_CELL_PADDING_PT,
  TRUE_FALSE_MARKER_GAP_PT,
  TRUE_FALSE_MARKER_TEXT,
  RULE_WIDTH_PT,
} from "../pageTokens";

// O vão entre itens vem de pageTokens para o papel imprimir o mesmo passo que as
// duas telas mostram (achado 0313).
const ROW = { flexDirection: "row", marginBottom: ANSWER_ITEM_GAP_PT } as const;
// flexShrink: 0 prevents the marker column from collapsing when the row is
// tight, which would push marker text over the content column. A largura vem
// do corpo do item (achado 0182): com a coluna fixa em pt e o glifo escalando
// com o popover Formato, era o TEXTO do marcador que quebrava dentro da caixa.
const markerStyle = (fontSizePt: number) =>
  ({
    ...pdfTextSize(fontSizePt),
    width: alternativeMarkerColumnPt(fontSizePt),
    flexShrink: 0,
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
 * A caixa da seta ocupa a altura de UMA linha do item (corpo x entrelinha), com
 * a mesma folga lateral que o glifo tinha, para o par continuar alinhado pelo
 * topo como as duas colunas de texto.
 */
const matchingLinkStyle = (fontSizePt: number) =>
  ({
    width: matchingLinkWidthPt(fontSizePt),
    height: fontSizePt * BASE_LINE_HEIGHT,
    marginHorizontal: 6,
    flexShrink: 0,
  }) as const;

// Largura e altura explícitas: sem elas o @react-pdf mede o `Canvas` chamando o
// `paint` com um contexto de medição e a linha colapsa.
const ANSWER_LINE_STYLE = {
  width: "100%",
  height: ANSWER_LINE_WIDTH_PT,
  marginBottom: ANSWER_LINE_GAP_PT,
} as const;

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
  switch (answer.kind) {
    case "open": {
      const lines = answer.answerLines ?? 3;
      return (
        <View>
          {Array.from({ length: lines }, (_, i) => (
            <Canvas key={i} style={ANSWER_LINE_STYLE} paint={paintAnswerLine} />
          ))}
        </View>
      );
    }
    case "multipleChoice":
      return (
        <View>
          {answer.alternatives.map((alt, i) => (
            <View key={alt.id} style={ROW}>
              <Text style={MARKER}>{indexToLetter(i)})</Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={alt.content} fontSize={elementSizes.alternative} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "trueFalse":
      return (
        <View>
          {answer.items.map((item) => (
            <View key={item.id} style={ROW}>
              <Text style={TF_MARKER}>{TRUE_FALSE_MARKER_TEXT}</Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={item.content} fontSize={elementSizes.alternative} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "checkbox":
      return (
        <View>
          {answer.items.map((item) => (
            <View key={item.id} style={ROW}>
              <Text style={MARKER}>[ ]</Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={item.content} fontSize={elementSizes.alternative} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "matching":
      return (
        <View>
          {answer.pairs.map((pair) => (
            <View key={pair.id} style={ROW}>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={pair.left} fontSize={elementSizes.alternative} />
                </Text>
              </View>
              <Canvas
                style={matchingLinkStyle(elementSizes.alternative)}
                paint={paintMatchingLink}
              />
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={pair.right} fontSize={elementSizes.alternative} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "ordering":
      return (
        <View>
          {answer.items.map((item) => (
            <View key={item.id} style={ROW}>
              <Text style={MARKER}>____</Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={item.content} fontSize={elementSizes.alternative} />
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
        borderColor: "#999999",
        // Recuo e traço vêm de pageTokens: a prévia do Exportar mede o próprio
        // DOM para contar as folhas, então a célula das duas superfícies precisa
        // ter a mesma altura de linha (achado 0607).
        padding: TABLE_CELL_PADDING_PT,
      } as const;
      return (
        <View
          style={{
            borderTopWidth: RULE_WIDTH_PT,
            borderLeftWidth: RULE_WIDTH_PT,
            borderColor: "#999999",
          }}
        >
          {header && (
            // `wrap={false}`: sem isso o react-pdf fatia a linha na virada de
            // página e deixa a moldura numa folha e o texto na outra (0602).
            // `fixed`: no react-pdf só o que é fixo reaparece a cada folha em
            // que o pai continua — é o que repete o cabeçalho e evita a página
            // com linhas de dados sem rótulo de coluna (0603).
            <View fixed wrap={false} style={{ flexDirection: "row" }}>
              {header.map((c, i) => (
                <View key={i} style={cell}>
                  <Text style={{ fontWeight: "bold" }}>
                    <PdfRichText content={c} fontSize={baseFontSize} />
                  </Text>
                </View>
              ))}
            </View>
          )}
          {body.map((row, r) => (
            <View key={r} wrap={false} style={{ flexDirection: "row" }}>
              {row.map((c, i) => (
                <View key={i} style={cell}>
                  <Text>
                    <PdfRichText content={c} fontSize={baseFontSize} />
                  </Text>
                </View>
              ))}
            </View>
          ))}
        </View>
      );
    }
  }
}

export default PdfAnswer;
