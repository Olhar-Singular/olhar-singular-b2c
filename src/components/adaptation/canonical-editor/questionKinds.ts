/**
 * The 8 question answer kinds with their pt-BR labels, in a stable order.
 *
 * Single source for both the block inserter's "insert question" menu and the
 * question card's "Tipo" (change type) dropdown.
 */

import type { QuestionAnswer } from "@/lib/adaptation/canonical/schema";

export type QuestionKind = QuestionAnswer["kind"];

export const QUESTION_KINDS: { kind: QuestionKind; label: string }[] = [
  { kind: "open", label: "Dissertativa" },
  { kind: "multipleChoice", label: "Múltipla escolha" },
  { kind: "trueFalse", label: "Verdadeiro/Falso" },
  { kind: "checkbox", label: "Caixas de seleção" },
  { kind: "matching", label: "Associação" },
  { kind: "ordering", label: "Ordenação" },
  { kind: "fillBlank", label: "Lacunas" },
  { kind: "table", label: "Tabela" },
];
