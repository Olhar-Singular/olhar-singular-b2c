/**
 * O que a professora precisa ver sobre a LEITURA da prova antes de imprimir (C-03):
 * partes que o arquivo não deixou ler e valores que a leitura pode ter inventado.
 * Só informa. A extração liquida e a geração segue como sempre, sem bloquear nem cobrar
 * diferente.
 *
 * O tipo `ExtractionIssue` é o mesmo que a edge function devolve em `issues`
 * (`_shared/examExtractionCheck.ts` o importa daqui); nada mais é importado.
 */

import { hasUnreadMarker, findBareCommandLines } from "./unreadMarker.ts";

export type ExtractionIssueKind =
  | "unread"
  | "gap"
  | "invented"
  | "lost_marker"
  // From the ADAPTATION check (C-04): a value the activity never had, and a not-read marker the AI removed.
  | "new_value"
  | "marker_dropped"
  // A formula KaTeX cannot show that the AI did not fix after the reask (C-10).
  | "invalid_latex"
  | "fraction"
  | "answer_key";

export interface ExtractionIssue {
  /** Posição (1) na extração; null quando não dá para localizar (lost_marker). */
  question: number | null;
  kind: ExtractionIssueKind;
  items: string[];
  /** How many questions the extraction had: tells whether `question` is still the sheet's number. */
  of?: number;
  /** The first words of the question, to find it when the sheet was renumbered or split. */
  excerpt?: string;
}

const KINDS: ReadonlySet<string> = new Set<ExtractionIssueKind>(["unread", "gap", "invented", "lost_marker", "new_value", "marker_dropped", "invalid_latex", "fraction", "answer_key"]);

/** `issues` da resposta de extract-exam-for-adaptation. Função antiga sem o campo = nada a mostrar. */
export function parseExtractionIssues(value: unknown): ExtractionIssue[] {
  const list = (value as { issues?: unknown } | undefined)?.issues ?? value;
  if (!Array.isArray(list)) return [];
  return list.filter(
    (i): i is ExtractionIssue =>
      !!i &&
      typeof i === "object" &&
      (typeof i.question === "number" || i.question === null) &&
      KINDS.has(i.kind) &&
      Array.isArray(i.items) &&
      i.items.every((item: unknown) => typeof item === "string"),
  );
}

// ── Antes de qualquer cobrança: o texto que o navegador leu do arquivo ───────

export interface InputProblem {
  /** Número da questão como impresso ("7"), ou null antes da primeira. */
  question: string | null;
  kind: "unread" | "gap";
  excerpt: string;
}

const QUESTION_LABEL = /^\s*(?:quest[aã]o|q)?\s*(\d+)\s*[.):\-–]/iu;
const MAX_EXCERPT = 80;

/** Linhas do texto lido que carregam um marcador de 'não lida' ou um verbo de comando sem objeto. */
export function findInputProblems(text: string): InputProblem[] {
  const problems: InputProblem[] = [];
  let question: string | null = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    question = line.match(QUESTION_LABEL)?.[1] ?? question;
    const kind = hasUnreadMarker(line) ? "unread" : findBareCommandLines(line).length ? "gap" : null;
    if (!kind) continue;
    const excerpt = line.length > MAX_EXCERPT ? `${line.slice(0, MAX_EXCERPT)}…` : line;
    problems.push({ question, kind, excerpt });
  }
  return problems;
}

const where = (question: string | number | null): string => (question === null ? "" : `Questão ${question}: `);

export function describeInputProblems(problems: InputProblem[]): string[] {
  return problems.map((p) => {
    if (p.kind === "gap") return `${where(p.question)}parece estar sem a conta ou a expressão.`;
    return p.question === null
      ? "Um trecho do arquivo tem uma parte que não deu para ler (fórmula ou figura)."
      : `${where(p.question)}tem uma parte que o arquivo não deixou ler (fórmula ou figura).`;
  });
}

// ── Depois da leitura por IA ─────────────────────────────────────────────────

const SHOWN_ITEMS = 5;

function listItems(items: string[]): string {
  const shown = items.slice(0, SHOWN_ITEMS).join(", ");
  const rest = items.length - SHOWN_ITEMS;
  return rest > 0 ? `${shown} e mais ${rest}` : shown;
}

/**
 * What the sheet prints, to name the question the way the teacher sees it: its printed
 * numbers in order (`customNumber` or the ordinal). Without it, the position in the
 * extraction is used as is.
 */
export interface SheetNumbers {
  labels: string[];
}

/** "Questão 3: ", by the printed number when the sheet still has the extraction's questions. */
function locate(issue: ExtractionIssue, sheet?: SheetNumbers): string {
  if (issue.question === null) return "";
  if (!sheet) return where(issue.question);
  // An issue without `of` comes from an older response: the position is all there is.
  if (issue.of === undefined || issue.of === sheet.labels.length) return where(sheet.labels[issue.question - 1] ?? issue.question);
  // The AI merged, split or dropped questions: a number would point at the wrong one.
  return issue.excerpt ? `A questão "${issue.excerpt}": ` : "Uma questão: ";
}

/**
 * O título e a dica do aviso que o Revisar mostra sobre a ADAPTAÇÃO (L9BC-6). "Números" só quando
 * todo aviso é de número que a atividade não trazia (`new_value`); fórmula que não aparece, fração,
 * gabarito reservado e marcador tirado pedem um texto que não diga "números".
 */
export function adaptationNoticeCopy(issues: ExtractionIssue[]): { title: string; hint: string } {
  if (issues.every((i) => i.kind === "new_value")) {
    return {
      title: "Confira estes números com a atividade original",
      hint: "A IA pode ter incluído números que a atividade não trazia (por exemplo, medidas de uma figura). Compare com o original e corrija direto na folha antes de exportar.",
    };
  }
  return {
    title: "Confira estes trechos com a atividade original",
    hint: "A IA pode ter incluído algo que a atividade não trazia, deixado uma parte sem resolver ou entregue uma fórmula que não aparece. Compare com o original e corrija direto na folha antes de exportar.",
  };
}

export function describeExtractionIssues(issues: ExtractionIssue[], sheet?: SheetNumbers): string[] {
  return issues.map((i) => {
    const here = locate(i, sheet);
    switch (i.kind) {
      case "invented":
        return `${here}tem valores que não aparecem no arquivo enviado (${listItems(i.items)}). Compare com o original.`;
      case "unread":
        return `${here}tem uma parte que não deu para ler (fórmula ou figura). Complete na revisão.`;
      case "gap":
        return `${here}parece estar sem a conta ou a expressão. Compare com o original.`;
      case "lost_marker":
        return "Uma parte que não deu para ler foi completada pela leitura. Compare todas as contas com o original.";
      case "new_value":
        return `${here}tem números que a atividade enviada não trazia (${listItems(i.items)}). Se a questão depende de uma figura ou gráfico, a IA pode ter inventado os dados: compare com o original.`;
      case "answer_key":
        return `${here}tem uma parte que não deu para ler, então o gabarito dela é só um espaço reservado: a questão não foi resolvida. Complete a parte que falta e marque a resposta certa.`;
      case "fraction":
        return here
          ? `${here}tem uma fração que pode ter perdido o agrupamento (${listItems(i.items)}). Compare com o original: o numerador e o denominador precisam ser os do arquivo.`
          : `Uma fração do arquivo pode ter perdido o agrupamento (${listItems(i.items)}). Compare com o original: o numerador e o denominador precisam ser os do arquivo.`;
      case "invalid_latex":
        return `${here}tem uma fórmula que não foi possível mostrar (${listItems(i.items)}). Corrija direto na folha antes de exportar.`;
      case "marker_dropped":
        return "A IA tirou uma parte que não deu para ler (fórmula ou figura) e escreveu outra no lugar. Compare as contas com o original.";
    }
  });
}
