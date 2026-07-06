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

import { View, Text } from "@react-pdf/renderer";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { indexToLetter } from "../letters";
import { PdfRichText } from "./PdfRichText";

const ROW = { flexDirection: "row", marginBottom: 3 } as const;
// flexShrink: 0 prevents the marker column from collapsing when the row is
// tight, which would push marker text over the content column.
const MARKER = { width: 22, flexShrink: 0 } as const;
const FLEX = { flexGrow: 1, flexShrink: 1 } as const;

// Marcador de verdadeiro/falso para o aluno assinalar — não revela o valor.
const TF_MARKER = { width: 60, flexShrink: 0 } as const;

export function PdfAnswer({ answer }: { answer: QuestionAnswer }) {
  switch (answer.kind) {
    case "open": {
      const lines = answer.answerLines ?? 3;
      return (
        <View>
          {Array.from({ length: lines }, (_, i) => (
            <View
              key={i}
              style={{ borderBottomWidth: 1, borderBottomColor: "#999999", borderBottomStyle: "dashed", marginBottom: 10 }}
            />
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
                <Text>
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
                <Text>
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
                <Text>
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
                <Text>
                  <PdfRichText content={pair.left} />
                </Text>
              </View>
              <Text style={{ marginHorizontal: 6, flexShrink: 0 }}>↔</Text>
              <View style={FLEX}>
                <Text>
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
                <Text>
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
