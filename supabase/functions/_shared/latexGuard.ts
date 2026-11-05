// =============================================================================
// LaTeX at the AI border (C-10, C-12, C-18).
//
// `interpretAiResponse` used to accept anything for `latex` (the schema says `min(1)`): `\frac{1`,
// `R$ 10,00`, `x^2^3`, a `___` blank inside a formula. The editor already refuses those (it asks
// KaTeX through `latexProblem`); the AI path never did, and the sheet showed red error boxes. This
// module gives the border the SAME verdict as the editor:
//  - `repairJsonLatex` fixes the two recoverable defects BEFORE the schema (a JSON escape that
//    ate a backslash, a raw `%`), and reports each repair for the log;
//  - `findLatexIssues` lists the formulas KaTeX still cannot show, with the question they are in;
//  - the callers turn that into a reask (naming the formula) and, if the model does not fix it,
//    into a per-question notice in `review_issues`. It never fails the request or changes billing.
// =============================================================================

import { latexProblem, repairLatex } from "../../../src/lib/domain/latexValidation.ts";
import type { AdaptationResult } from "../../../src/lib/adaptation/canonical/schema.ts";
import type { ExtractionIssue } from "../../../src/lib/domain/examIssues.ts";

export interface LatexIssue {
  /** Position among the top-level questions (the number the sheet prints); null outside any question. */
  question: number | null;
  latex: string;
  reason: string;
}

/** Repairs every `latex` string of the parsed JSON, at any depth. Same object back when nothing changed. */
export function repairJsonLatex(json: unknown): { json: unknown; repairs: string[] } {
  const repairs: string[] = [];
  const walk = (node: unknown): unknown => {
    if (Array.isArray(node)) {
      const mapped = node.map(walk);
      return mapped.some((m, i) => m !== node[i]) ? mapped : node;
    }
    if (node && typeof node === "object") {
      const entries = Object.entries(node as Record<string, unknown>);
      let changed = false;
      const next: Record<string, unknown> = {};
      for (const [key, value] of entries) {
        let out: unknown;
        if (key === "latex" && typeof value === "string") {
          const fixed = repairLatex(value);
          repairs.push(...fixed.repairs);
          out = fixed.latex;
        } else {
          out = walk(value);
        }
        if (out !== value) changed = true;
        next[key] = out;
      }
      return changed ? next : node;
    }
    return node;
  };
  const fixed = walk(json);
  return { json: fixed, repairs };
}

/** Every latex string under a node (inline and block math), in document order, with how the sheet draws it. */
function latexIn(node: unknown, out: Array<{ latex: string; displayMode: boolean }>): void {
  if (Array.isArray(node)) {
    for (const child of node) latexIn(child, out);
  } else if (node && typeof node === "object") {
    const record = node as Record<string, unknown>;
    for (const [key, value] of Object.entries(record)) {
      // A `blockMath` is drawn in display mode (`\begin{equation}` is fine there), an `inlineMath` is not.
      if (key === "latex" && typeof value === "string") out.push({ latex: value, displayMode: record.type === "blockMath" });
      else latexIn(value, out);
    }
  }
}

export function findLatexIssues(result: AdaptationResult): LatexIssue[] {
  const issues: LatexIssue[] = [];
  let questionNumber = 0;
  for (const block of result.document.blocks as unknown[]) {
    const isQuestion = (block as { type?: string } | null)?.type === "question";
    if (isQuestion) questionNumber += 1;
    const formulas: Array<{ latex: string; displayMode: boolean }> = [];
    latexIn(block, formulas);
    for (const { latex, displayMode } of formulas) {
      const reason = latexProblem(latex, { displayMode });
      // KaTeX echoes the source after "at position N:" (with combining marks): the formula is named already.
      if (reason) issues.push({ question: isQuestion ? questionNumber : null, latex, reason: reason.replace(/(at position \d+):[\s\S]*$/, "$1") });
    }
  }
  return issues;
}

const MAX_SHOWN = 120;
const shown = (latex: string) => (latex.length > MAX_SHOWN ? `${latex.slice(0, MAX_SHOWN)}…` : latex);

/** The reask lines: they name the formula so the model fixes THAT one. */
export function latexIssueErrors(issues: LatexIssue[]): string[] {
  return issues.map((i) => {
    const where = i.question === null ? "fora das questões" : `na questão ${i.question}`;
    return `Fórmula LaTeX inválida ${where}: "${shown(i.latex)}" (${i.reason}). Reescreva essa fórmula em LaTeX válido.`;
  });
}

/** What the teacher sees when the model did not fix the formulas: one notice per formula. */
export function latexIssuesToReview(issues: LatexIssue[], questionCount: number): ExtractionIssue[] {
  return issues.map((i) => ({
    question: i.question,
    kind: "invalid_latex" as const,
    items: [shown(i.latex)],
    ...(i.question === null ? {} : { of: questionCount }),
  }));
}
