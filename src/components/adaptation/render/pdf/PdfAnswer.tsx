/**
 * PdfAnswer — PDF analogue of AnswerView. Dispatches a canonical
 * `QuestionAnswer` to a react-pdf projection per kind. Mirrors the screen
 * renderer's authoritative decisions:
 *   - multipleChoice: lettered alternatives, correct flag marked (✔)
 *   - trueFalse: (V)/(F) prefix from the authored value
 *   - checkbox: [x]/[ ] from the authored checked flag
 *   - matching: left ↔ right authored pairing
 *   - ordering: items sorted by position, numbered (the answer key)
 *   - fillBlank: authored answer (+ alternatives / tip)
 *   - table: first row = header, rest = body
 *   - open: blank answer lines (defaults to 3)
 * The `kind` discriminant is exhaustive over the typed union — no default.
 */

import { View, Text } from "@react-pdf/renderer";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { indexToLetter } from "../letters";
import { PdfRichText } from "./PdfRichText";

const ROW = { flexDirection: "row", marginBottom: 3 } as const;
const MARKER = { width: 22 } as const;
const FLEX = { flexGrow: 1 } as const;

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
                  {alt.correct ? <Text> ✔</Text> : null}
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
              <Text style={MARKER}>({item.value ? "V" : "F"})</Text>
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
              <Text style={MARKER}>[{item.checked ? "x" : " "}]</Text>
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
              <Text style={{ marginHorizontal: 6 }}>↔</Text>
              <View style={FLEX}>
                <Text>
                  <PdfRichText content={pair.right} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "ordering": {
      const ordered = [...answer.items].sort((a, b) => a.position - b.position);
      return (
        <View>
          {ordered.map((item, i) => (
            <View key={item.id} style={ROW}>
              <Text style={MARKER}>{i + 1}.</Text>
              <View style={FLEX}>
                <Text>
                  <PdfRichText content={item.content} />
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    }
    case "fillBlank":
      return (
        <View>
          {answer.gaps.map((gap, i) => (
            <View key={gap.id} style={ROW}>
              <Text style={MARKER}>({i + 1})</Text>
              <View style={FLEX}>
                <Text>
                  {gap.answer}
                  {gap.alternatives && gap.alternatives.length > 0 ? (
                    <Text style={{ color: "#666666" }}> (também: {gap.alternatives.join(", ")})</Text>
                  ) : null}
                  {gap.tip ? <Text style={{ color: "#666666", fontStyle: "italic" }}> {gap.tip}</Text> : null}
                </Text>
              </View>
            </View>
          ))}
        </View>
      );
    case "table": {
      const [header, ...body] = answer.rows;
      return (
        <View>
          {header && (
            <View style={{ flexDirection: "row" }}>
              {header.map((cell, c) => (
                <View key={c} style={{ flexGrow: 1, borderWidth: 1, borderColor: "#999999", padding: 3 }}>
                  <Text style={{ fontWeight: "bold" }}>
                    <PdfRichText content={cell} />
                  </Text>
                </View>
              ))}
            </View>
          )}
          {body.map((row, r) => (
            <View key={r} style={{ flexDirection: "row" }}>
              {row.map((cell, c) => (
                <View key={c} style={{ flexGrow: 1, borderWidth: 1, borderColor: "#999999", padding: 3 }}>
                  <Text>
                    <PdfRichText content={cell} />
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
