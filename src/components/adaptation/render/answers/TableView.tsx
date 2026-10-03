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
import { TABLE_CELL_PADDING_PX, RULE_COLOR, RULE_WIDTH_PX, BASE_LINE_HEIGHT } from "../pageTokens";

type TableAnswer = Extract<QuestionAnswer, { kind: "table" }>;

/**
 * Achado 0195: sem `table-layout: fixed` o browser dimensiona cada coluna pelo
 * conteúdo mais largo, enquanto o PDF (`flexBasis: 0`) e o Word (`columnWidths`
 * iguais) dividem a largura útil em partes iguais. A grade da tela precisa ser
 * a do papel, senão o professor ajusta uma proporção que o aluno não recebe.
 */
const TABLE_STYLE: CSSProperties = { tableLayout: "fixed" };

const CELL_STYLE: CSSProperties = {
  padding: `${TABLE_CELL_PADDING_PX}px`,
  borderWidth: `${RULE_WIDTH_PX}px`,
  // Achado 0522: a tinta é a régua do documento, não o `border-border` do
  // chrome do app (1,33:1 sobre o papel); a mesma do PDF e do Word.
  borderColor: RULE_COLOR,
  lineHeight: BASE_LINE_HEIGHT,
};

/**
 * `data-folha-tabela` (achado 0262): a folha da prévia repete o cabeçalho desta
 * tabela no topo de cada página em que ela continua, como o PDF (linha `fixed`)
 * e o .docx (`tblHeader`) fazem. Quem sabe onde a página vira é `PageSheet`;
 * aqui só se diz qual tabela é impressa.
 */
export function TableView({ answer }: { answer: TableAnswer }) {
  const [header, ...body] = answer.rows;
  return (
    <table
      data-testid="answer-table"
      data-folha-tabela=""
      style={TABLE_STYLE}
      className="w-full border-collapse"
    >
      {header && (
        <thead>
          <tr>
            {header.map((cell, c) => (
              <th
                key={c}
                style={CELL_STYLE}
                className="border text-left align-top font-semibold"
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
              <td key={c} style={CELL_STYLE} className="border align-top">
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
