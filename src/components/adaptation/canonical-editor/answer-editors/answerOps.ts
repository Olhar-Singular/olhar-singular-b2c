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

type Generate = () => string;

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

export function setAlternativeContent(answer: QuestionAnswer, id: string, content: RichText): QuestionAnswer {
  if (answer.kind !== "multipleChoice") return answer;
  return {
    ...answer,
    alternatives: answer.alternatives.map((alt) =>
      alt.id === id ? { ...alt, content } : alt
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

export function setTrueFalseContent(answer: QuestionAnswer, id: string, content: RichText): QuestionAnswer {
  if (answer.kind !== "trueFalse") return answer;
  return {
    ...answer,
    items: answer.items.map((item) => (item.id === id ? { ...item, content } : item)),
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

export function setCheckboxContent(answer: QuestionAnswer, id: string, content: RichText): QuestionAnswer {
  if (answer.kind !== "checkbox") return answer;
  return {
    ...answer,
    items: answer.items.map((item) => (item.id === id ? { ...item, content } : item)),
  };
}

// matching ------------------------------------------------------------------

export function setMatchingSide(
  answer: QuestionAnswer,
  id: string,
  side: "left" | "right",
  content: RichText
): QuestionAnswer {
  if (answer.kind !== "matching") return answer;
  return {
    ...answer,
    pairs: answer.pairs.map((pair) =>
      pair.id === id ? { ...pair, [side]: content } : pair
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

export function setOrderingContent(answer: QuestionAnswer, id: string, content: RichText): QuestionAnswer {
  if (answer.kind !== "ordering") return answer;
  return {
    ...answer,
    items: answer.items.map((item) => (item.id === id ? { ...item, content } : item)),
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
  content: RichText
): QuestionAnswer {
  if (answer.kind !== "table") return answer;
  if (row < 0 || row >= answer.rows.length) return answer;
  if (col < 0 || col >= answer.rows[row].length) return answer;
  return {
    ...answer,
    rows: answer.rows.map((r, ri) =>
      ri === row ? r.map((cell, ci) => (ci === col ? content : cell)) : r
    ),
  };
}

// changeAnswerKind ----------------------------------------------------------

type CarryItem = { content: RichText; flag: boolean };

/**
 * Item texts (+ their correctness flag) of a "carry" source — only the kinds
 * the §6.3 matrix lets carry text: `multipleChoice` (flag = correct) and
 * `checkbox` (flag = checked). Every other kind returns null.
 */
function carrySource(answer: QuestionAnswer): CarryItem[] | null {
  if (answer.kind === "multipleChoice")
    return answer.alternatives.map((a) => ({ content: a.content, flag: a.correct }));
  if (answer.kind === "checkbox")
    return answer.items.map((i) => ({ content: i.content, flag: i.checked }));
  return null;
}

/**
 * Best-effort conversion of an answer to a different `kind` (plano §6.3 / D8) —
 * what the question card's "Tipo" dropdown dispatches. Pure and immutable like
 * the rest of this module; stem and instruction live OUTSIDE the answer, so they
 * are never touched here.
 *
 * Strict to the §6.3 matrix: only `multipleChoice`/`checkbox` carry their item
 * texts, and only to another list kind (multipleChoice, checkbox, trueFalse,
 * ordering) — the correct/checked/true flag maps between them. Every other
 * source→list-target combination, and any→open/fillBlank/matching/table, yields
 * the empty default structure. Losing answer data is acceptable (undo recovers).
 * Same kind in/out is a no-op (referential identity).
 */
export function changeAnswerKind(
  answer: QuestionAnswer,
  target: QuestionAnswer["kind"],
  generate: Generate = newId
): QuestionAnswer {
  if (answer.kind === target) return answer;

  const source = carrySource(answer);
  const carried = source && source.length > 0 ? source : null;

  switch (target) {
    case "multipleChoice": {
      if (!carried) {
        return {
          kind: "multipleChoice",
          alternatives: [
            { id: generate(), content: [], correct: true },
            { id: generate(), content: [], correct: false },
          ],
        };
      }
      // MC needs exactly one correct: the first flagged item, else the first.
      const found = carried.findIndex((it) => it.flag);
      const correctIdx = found === -1 ? 0 : found;
      return {
        kind: "multipleChoice",
        alternatives: carried.map((it, i) => ({
          id: generate(),
          content: it.content,
          correct: i === correctIdx,
        })),
      };
    }
    case "checkbox": {
      if (!carried) return { kind: "checkbox", items: [{ id: generate(), content: [], checked: false }] };
      return {
        kind: "checkbox",
        items: carried.map((it) => ({ id: generate(), content: it.content, checked: it.flag })),
      };
    }
    case "trueFalse": {
      if (!carried) return { kind: "trueFalse", items: [{ id: generate(), content: [], value: true }] };
      return {
        kind: "trueFalse",
        items: carried.map((it) => ({ id: generate(), content: it.content, value: it.flag })),
      };
    }
    case "ordering": {
      if (!carried) return { kind: "ordering", items: [{ id: generate(), content: [], position: 0 }] };
      return {
        kind: "ordering",
        items: carried.map((it, i) => ({ id: generate(), content: it.content, position: i })),
      };
    }
    case "open":
      return { kind: "open", answerLines: 3 };
    case "fillBlank":
      return { kind: "fillBlank", gaps: [] };
    case "matching":
      return { kind: "matching", pairs: [{ id: generate(), left: [], right: [] }] };
    /* v8 ignore next 2 -- exhaustive switch; QuestionKind admits no other value */
    case "table":
      return { kind: "table", rows: [[[], []]] };
  }
}
