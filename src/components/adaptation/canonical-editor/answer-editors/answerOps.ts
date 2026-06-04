/**
 * Pure mutation helpers for the discriminated `QuestionAnswer` model.
 *
 * Every function takes a `QuestionAnswer` and returns a NEW `QuestionAnswer`
 * (immutable; the input is never mutated). Operations that do not apply to the
 * given answer kind return the input unchanged (referential identity), so a
 * caller can wire any handler to any answer without branching.
 *
 * These functions are the single source of truth for answer edits — the React
 * answer-editor sub-components only render and dispatch these ops, which keeps
 * the mutation logic fully unit-testable at 100%.
 */

import type { QuestionAnswer, RichText } from "@/lib/adaptation/canonical/schema";
import { newId } from "@/lib/adaptation/canonical/ids";
import { richTextToPlain } from "../richText";

type Generate = () => string;

/**
 * Resolve the new RichText for a plain-text answer input.
 *
 * The answer editors are plain `<input>`s that render the existing RichText via
 * `richTextToPlain`. When the typed text equals the flattened plain text of the
 * current value, the user did NOT change the visible text (e.g. a focus/blur or
 * editing a sibling field re-fired onChange) — so we PRESERVE the existing
 * RichText, keeping its marks/color/inlineMath instead of flattening it into a
 * single plain run. Only a real visible-text change flattens (full rich-text
 * answer editing remains a roadmap item).
 */
function plainText(existing: RichText | undefined, next: string): RichText {
  if (existing !== undefined && richTextToPlain(existing) === next) return existing;
  return next === "" ? [] : [{ type: "text", text: next }];
}

// multipleChoice ------------------------------------------------------------

export function setCorrectAlternative(answer: QuestionAnswer, id: string): QuestionAnswer {
  if (answer.kind !== "multipleChoice") return answer;
  return {
    ...answer,
    alternatives: answer.alternatives.map((alt) => ({ ...alt, correct: alt.id === id })),
  };
}

export function addAlternative(answer: QuestionAnswer, generate: Generate = newId): QuestionAnswer {
  if (answer.kind !== "multipleChoice") return answer;
  return {
    ...answer,
    alternatives: [...answer.alternatives, { id: generate(), content: [], correct: false }],
  };
}

export function removeAlternative(answer: QuestionAnswer, id: string): QuestionAnswer {
  if (answer.kind !== "multipleChoice") return answer;
  if (answer.alternatives.length <= 1) return answer;
  const removed = answer.alternatives.find((a) => a.id === id);
  const remaining = answer.alternatives.filter((a) => a.id !== id);
  // Guarantee exactly one correct alternative survives.
  const alternatives =
    removed?.correct === true
      ? remaining.map((a, i) => ({ ...a, correct: i === 0 }))
      : remaining;
  return { ...answer, alternatives };
}

export function setAlternativeText(answer: QuestionAnswer, id: string, text: string): QuestionAnswer {
  if (answer.kind !== "multipleChoice") return answer;
  return {
    ...answer,
    alternatives: answer.alternatives.map((alt) =>
      alt.id === id ? { ...alt, content: plainText(alt.content, text) } : alt
    ),
  };
}

// trueFalse -----------------------------------------------------------------

export function setTrueFalseValue(answer: QuestionAnswer, id: string, value: boolean): QuestionAnswer {
  if (answer.kind !== "trueFalse") return answer;
  return {
    ...answer,
    items: answer.items.map((item) => (item.id === id ? { ...item, value } : item)),
  };
}

export function setTrueFalseText(answer: QuestionAnswer, id: string, text: string): QuestionAnswer {
  if (answer.kind !== "trueFalse") return answer;
  return {
    ...answer,
    items: answer.items.map((item) => (item.id === id ? { ...item, content: plainText(item.content, text) } : item)),
  };
}

// checkbox ------------------------------------------------------------------

export function toggleCheckbox(answer: QuestionAnswer, id: string): QuestionAnswer {
  if (answer.kind !== "checkbox") return answer;
  return {
    ...answer,
    items: answer.items.map((item) =>
      item.id === id ? { ...item, checked: !item.checked } : item
    ),
  };
}

export function setCheckboxText(answer: QuestionAnswer, id: string, text: string): QuestionAnswer {
  if (answer.kind !== "checkbox") return answer;
  return {
    ...answer,
    items: answer.items.map((item) => (item.id === id ? { ...item, content: plainText(item.content, text) } : item)),
  };
}

// matching ------------------------------------------------------------------

export function setMatchingSide(
  answer: QuestionAnswer,
  id: string,
  side: "left" | "right",
  text: string
): QuestionAnswer {
  if (answer.kind !== "matching") return answer;
  return {
    ...answer,
    pairs: answer.pairs.map((pair) =>
      pair.id === id ? { ...pair, [side]: plainText(pair[side], text) } : pair
    ),
  };
}

export function addMatchingPair(answer: QuestionAnswer, generate: Generate = newId): QuestionAnswer {
  if (answer.kind !== "matching") return answer;
  return {
    ...answer,
    pairs: [...answer.pairs, { id: generate(), left: [], right: [] }],
  };
}

export function removeMatchingPair(answer: QuestionAnswer, id: string): QuestionAnswer {
  if (answer.kind !== "matching") return answer;
  if (answer.pairs.length <= 1) return answer;
  return { ...answer, pairs: answer.pairs.filter((p) => p.id !== id) };
}

// ordering ------------------------------------------------------------------

export function setOrderingText(answer: QuestionAnswer, id: string, text: string): QuestionAnswer {
  if (answer.kind !== "ordering") return answer;
  return {
    ...answer,
    items: answer.items.map((item) => (item.id === id ? { ...item, content: plainText(item.content, text) } : item)),
  };
}

export function reorderOrdering(answer: QuestionAnswer, from: number, to: number): QuestionAnswer {
  if (answer.kind !== "ordering") return answer;
  const { items } = answer;
  if (from < 0 || from >= items.length || to < 0 || to >= items.length) return answer;
  const next = [...items];
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return {
    ...answer,
    items: next.map((item, i) => ({ ...item, position: i })),
  };
}

// fillBlank -----------------------------------------------------------------

export function setGapAnswer(answer: QuestionAnswer, id: string, value: string): QuestionAnswer {
  if (answer.kind !== "fillBlank") return answer;
  return {
    ...answer,
    gaps: answer.gaps.map((gap) => (gap.id === id ? { ...gap, answer: value } : gap)),
  };
}

export function addGap(answer: QuestionAnswer, generate: Generate = newId): QuestionAnswer {
  if (answer.kind !== "fillBlank") return answer;
  return { ...answer, gaps: [...answer.gaps, { id: generate(), answer: "" }] };
}

export function removeGap(answer: QuestionAnswer, id: string): QuestionAnswer {
  if (answer.kind !== "fillBlank") return answer;
  if (answer.gaps.length <= 1) return answer;
  return { ...answer, gaps: answer.gaps.filter((g) => g.id !== id) };
}

// open ----------------------------------------------------------------------

export function setAnswerLines(answer: QuestionAnswer, lines: number): QuestionAnswer {
  if (answer.kind !== "open") return answer;
  if (lines <= 0) {
    const next = { ...answer };
    delete next.answerLines;
    return next;
  }
  return { ...answer, answerLines: lines };
}

// table ---------------------------------------------------------------------

export function setTableCell(
  answer: QuestionAnswer,
  row: number,
  col: number,
  text: string
): QuestionAnswer {
  if (answer.kind !== "table") return answer;
  if (row < 0 || row >= answer.rows.length) return answer;
  if (col < 0 || col >= answer.rows[row].length) return answer;
  return {
    ...answer,
    rows: answer.rows.map((r, ri) =>
      ri === row ? r.map((cell, ci) => (ci === col ? plainText(cell, text) : cell)) : r
    ),
  };
}
