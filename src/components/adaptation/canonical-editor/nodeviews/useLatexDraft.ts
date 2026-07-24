/**
 * useLatexDraft — keeps a math NodeView's input editable without ever writing an
 * empty `latex` into the document.
 *
 * The canonical model requires `latex.min(1)`: an empty formula renders nothing
 * and is not representable. But the NodeViews wrote `e.target.value` straight
 * onto the node, so the instant the teacher selected the formula and pressed
 * Backspace to retype it, the WHOLE document stopped converting to canonical —
 * the autosave froze silently (still showing "Salvo") and only recovered if the
 * user happened to finish typing something.
 *
 * Refusing the keystroke would be worse (an unclearable field), so the typed
 * text lives in local state and only a non-empty value is committed. Blurring an
 * emptied field restores the last committed formula, so the input never lies
 * about what the document holds.
 */

import { useEffect, useState } from "react";

export interface LatexDraft {
  /** Value to bind to the input. */
  value: string;
  /** onChange handler for the input. */
  onChange: (next: string) => void;
  /** onBlur handler: restores the committed formula if left empty. */
  onBlur: () => void;
}

export function useLatexDraft(
  latex: string,
  commit: (latex: string) => void
): LatexDraft {
  const [draft, setDraft] = useState(latex);

  // Follow the attr when it changes from OUTSIDE this input (undo, re-seed of
  // the document, a sibling editing the same node).
  useEffect(() => {
    setDraft(latex);
  }, [latex]);

  return {
    value: draft,
    onChange: (next: string) => {
      setDraft(next);
      if (next.length > 0) commit(next);
    },
    onBlur: () => {
      if (draft.length === 0) setDraft(latex);
    },
  };
}
