/**
 * TableView — read-only render of a table answer. The first row is rendered as
 * a header (<th>); remaining rows as body cells. Each cell is RichText.
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";
import { RichTextView } from "../RichTextView";

type TableAnswer = Extract<QuestionAnswer, { kind: "table" }>;

export function TableView({ answer }: { answer: TableAnswer }) {
  const [header, ...body] = answer.rows;
  return (
    <table data-testid="answer-table" className="w-full border-collapse text-sm">
      {header && (
        <thead>
          <tr>
            {header.map((cell, c) => (
              <th key={c} className="border border-border px-2 py-1 text-left font-semibold">
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
              <td key={c} className="border border-border px-2 py-1">
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
