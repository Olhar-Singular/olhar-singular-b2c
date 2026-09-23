/**
 * Pure helpers shared by the NodeView components. Kept in a non-component module
 * so the React Fast-Refresh lint rule stays happy and the logic stays unit-testable.
 */

import type { ResolvedPos } from "@tiptap/pm/model";
import { TextSelection } from "@tiptap/pm/state";

import { renderLatexToHtml } from "@/lib/domain/latexRenderer";
import { announceOnSheet } from "./srAnnouncer";

/**
 * Minimal structural view of a ProseMirror doc node — just enough for
 * `questionOrdinal` to walk it without importing prosemirror-model types.
 */
export interface OrdinalDoc {
  descendants(fn: (node: { type: { name: string } }, pos: number) => void): void;
}

/**
 * Compute the 1-based ordinal of the question node at `pos` among all question
 * nodes in the document, in document order. The displayed question number is
 * derived purely from position — questions carry no stored `number` field.
 *
 * Counts question nodes whose position is strictly before `pos`, then adds 1.
 */
export function questionOrdinal(doc: OrdinalDoc, pos: number): number {
  let before = 0;
  doc.descendants((node, nodePos) => {
    if (node.type.name === "question" && nodePos < pos) before += 1;
  });
  return before + 1;
}

/**
 * Render a bare latex string to KaTeX HTML in display mode — the SAME engine
 * and display mode the read-only renderer (`BlockMathView`) uses, so the editor
 * preview can never diverge from the final render.
 */
export function latexToHtml(latex: string): string {
  return renderLatexToHtml(latex, true);
}

/**
 * Render a bare latex string to inline KaTeX HTML — the SAME engine and (inline)
 * display mode the read-only renderer (`RichTextView`) uses for inlineMath runs.
 */
export function inlineLatexToHtml(latex: string): string {
  return renderLatexToHtml(latex, false);
}

/**
 * Minimal structural view of the Tiptap editor needed to put the caret back on
 * the sheet after a node is removed. Kept structural (not `Editor`) so the
 * helper stays unit-testable without booting ProseMirror.
 */
export interface RefocusEditor {
  commands?: { focus?: (position?: number) => unknown };
  state?: {
    doc?: {
      content?: { size?: number };
      resolve?: (pos: number) => ResolvedPos;
    };
  };
}

/**
 * Delete a node AND give the focus a predictable home (achado 0253).
 *
 * Every delete button lives inside the very nodeview the deletion unmounts:
 * once `deleteNode()` runs, the focused `<button>` leaves the DOM and the
 * browser drops focus on `<body>`. From there `Tab` restarts at the top of the
 * page (WCAG 2.4.3 Focus Order) and `Ctrl+Z` never reaches ProseMirror, so the
 * shortcut that would undo the deletion is out of reach.
 *
 * The position is read BEFORE the deletion (afterwards the node is gone) and
 * clamped to the already-shrunk document, which is exactly the spot the next
 * sibling now occupies. With no usable position we still focus the sheet.
 *
 * That raw position is a boundary BETWEEN blocks, never a point inside inline
 * content, and `focus(pos)` always turns a number into a `TextSelection` — so
 * handing it over unchanged makes ProseMirror warn ("TextSelection endpoint not
 * pointing into a node with inline content") and leaves the caret in a state the
 * library does not support (achado 0352). We therefore ask ProseMirror for the
 * nearest valid TEXT position (`TextSelection.between`, searching forward first)
 * and focus that instead. When the document has no text position at all the
 * fallback is a plain focus, which keeps the selection ProseMirror itself picked
 * while applying the deletion.
 */
export function deleteNodeAndRefocus(
  deleteNode: () => void,
  editor: RefocusEditor,
  getPos?: () => number | undefined,
  announcement?: string,
): void {
  const posBefore = typeof getPos === "function" ? getPos() : undefined;
  deleteNode();
  // Achado 0256: a exclusão em si era muda — nenhuma região viva da tela mudava.
  // O anúncio mora aqui, no caminho único por onde passam os cinco deleteNode()
  // da folha, para não repetir a decisão em cada nodeview.
  if (announcement) announceOnSheet(announcement);
  const focus = editor?.commands?.focus;
  if (typeof focus !== "function") return;
  const doc = editor?.state?.doc;
  const size = doc?.content?.size;
  if (typeof posBefore === "number" && Number.isFinite(posBefore) && typeof size === "number") {
    const clamped = Math.max(0, Math.min(posBefore, size));
    const resolve = doc?.resolve;
    if (typeof resolve !== "function") {
      focus.call(editor.commands, clamped);
      return;
    }
    const $pos = resolve.call(doc, clamped);
    const near = TextSelection.between($pos, $pos, 1);
    if (near instanceof TextSelection) {
      focus.call(editor.commands, near.from);
      return;
    }
  }
  focus.call(editor.commands);
}
