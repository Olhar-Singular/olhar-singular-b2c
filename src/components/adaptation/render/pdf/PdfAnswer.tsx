/**
 * PdfAnswer — PDF analogue of AnswerView/AnswerPreview. Dispatches a canonical
 * `QuestionAnswer` to a react-pdf projection per kind.
 *
 * Gabarito (chave de respostas) está OCULTO — espelha AnswerPreview (D5):
 *   - multipleChoice: alternativas com letras a)/b)/…, SEM ✔ na correta
 *   - trueFalse: afirmação + marcadores vazios "(  ) V  (  ) F", SEM revelar o valor
 *   - checkbox: [ ] para TODOS os itens, SEM [x]
 *   - matching: left ↔ right — mantido (pareamento é a estrutura, não o gabarito)
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
  ALTERNATIVE_MARKER_COLUMN_PT,
} from "../pageTokens";

// O vão entre itens vem de pageTokens para o papel imprimir o mesmo passo que as
// duas telas mostram (achado 0313).
const ROW = { flexDirection: "row", marginBottom: ANSWER_ITEM_GAP_PT } as const;
// flexShrink: 0 prevents the marker column from collapsing when the row is
// tight, which would push marker text over the content column.
const MARKER = { width: ALTERNATIVE_MARKER_COLUMN_PT, flexShrink: 0 } as const;
// flexBasis: 0 é obrigatório. Sem ele o Yoga deriva a base medindo o texto
// contra a largura CHEIA do pai e só depois encolhe a caixa para caber ao
// lado do marcador: a caixa anda, mas as linhas já foram quebradas na
// medida larga e saem pela margem direita (com o marcador de 60pt do V/F,
// para fora do papel). Com base 0 o Yoga distribui o espaço que sobra
// depois do marcador — o mesmo que PdfQuestion faz com `flex: 1` (0162).
const FLEX = { flexGrow: 1, flexShrink: 1, flexBasis: 0 } as const;

// Marcador de verdadeiro/falso para o aluno assinalar — não revela o valor.
const TF_MARKER = { width: 60, flexShrink: 0 } as const;

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
}: {
  answer: QuestionAnswer;
  elementSizes?: ElementFontSizesPt;
}) {
  // Alternatives / items / cells all read at the "alternative" size, which
  // follows the document font size (see resolveElementFontSizes).
  const itemStyle = { fontSize: elementSizes.alternative };
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
                  <PdfRichText content={alt.content} />
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
              <Text style={TF_MARKER}>(  ) V  (  ) F</Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={item.content} />
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
                  <PdfRichText content={item.content} />
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
                  <PdfRichText content={pair.left} />
                </Text>
              </View>
              <Text style={{ marginHorizontal: 6, flexShrink: 0 }}>↔</Text>
              <View style={FLEX}>
                <Text style={itemStyle}>
                  <PdfRichText content={pair.right} />
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
                  <PdfRichText content={item.content} />
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
      const cell = {
        flexGrow: 1,
        borderRightWidth: 1,
        borderBottomWidth: 1,
        borderColor: "#999999",
        padding: 3,
      } as const;
      return (
        <View style={{ borderTopWidth: 1, borderLeftWidth: 1, borderColor: "#999999" }}>
          {header && (
            <View style={{ flexDirection: "row" }}>
              {header.map((c, i) => (
                <View key={i} style={cell}>
                  <Text style={{ fontWeight: "bold" }}>
                    <PdfRichText content={c} />
                  </Text>
                </View>
              ))}
            </View>
          )}
          {body.map((row, r) => (
            <View key={r} style={{ flexDirection: "row" }}>
              {row.map((c, i) => (
                <View key={i} style={cell}>
                  <Text>
                    <PdfRichText content={c} />
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
