import type { RichText } from "@/lib/adaptation/canonical/schema";

/**
 * Rótulo acessível de uma célula do corpo da tabela, o mesmo na folha
 * (AnswerPreview) e no card de estrutura (AnswerEditor, achado 0371). Cita o nome da coluna
 * (o texto do cabeçalho) para que o leitor de tela diga o que o valor é, e não
 * só a coordenada. Cabeçalho sem texto puro (só fórmula, ou vazio) volta para a
 * coordenada, que é sempre inequívoca.
 */
export function tableCellLabel(header: RichText | undefined, rowIndex: number, colIndex: number): string {
  const name = (header ?? [])
    .map((node) => (node.type === "text" ? node.text : ""))
    .join("")
    .trim();
  return name
    ? `Célula, ${name}, linha ${rowIndex + 1}`
    : `Célula linha ${rowIndex + 1} coluna ${colIndex + 1}`;
}
