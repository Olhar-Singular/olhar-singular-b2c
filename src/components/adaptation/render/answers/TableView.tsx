/**
 * TableView — read-only render of a table answer. The first row is rendered as
 * a header (<th>); remaining rows as body cells. Each cell is RichText.
 *
 * A caixa da célula (recuo, traço, corpo e entrelinha) vem de `pageTokens`, a
 * mesma origem do PDF: é por esta árvore que a prévia do Exportar conta as
 * folhas, então uma célula mais baixa aqui vira página a menos no rótulo
 * (achado 0607).
 */

import type { CSSProperties } from "react";
import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";
import { TABLE_CELL_PADDING_PX, RULE_WIDTH_PX, BASE_LINE_HEIGHT } from "../pageTokens";

type TableAnswer = Extract<QuestionAnswer, { kind: "table" }>;

const CELL_STYLE: CSSProperties = {
  padding: `${TABLE_CELL_PADDING_PX}px`,
  borderWidth: `${RULE_WIDTH_PX}px`,
  lineHeight: BASE_LINE_HEIGHT,
};

export function TableView({ answer }: { answer: TableAnswer }) {
  const [header, ...body] = answer.rows;
  return (
    <table data-testid="answer-table" className="w-full border-collapse">
      {header && (
        <thead>
          <tr>
            {header.map((cell, c) => (
              <th
                key={c}
                style={CELL_STYLE}
                className="border border-border text-left align-top font-semibold"
              >
                <RichTextView content={cell} />
              </th>
            ))}
          </tr>
        </thead>
      )}
      <tbody>
        {body.map((row, r) => (
          <tr key={r}>
            {row.map((cell, c) => (
              <td key={c} style={CELL_STYLE} className="border border-border align-top">
                <RichTextView content={cell} />
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default TableView;
