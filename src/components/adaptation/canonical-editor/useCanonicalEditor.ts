/**
 * useCanonicalEditor — wraps Tiptap's `useEditor` for the canonical model.
 *
 * - Builds the canonical extension list (`buildExtensions()`), adds `UniqueId`
 *   and wires the React NodeViews onto the custom nodes via
 *   `ReactNodeViewRenderer`.
 * - Seeds the editor with `canonicalToProseMirror(value)` once.
 * - On every editor update, converts the PM JSON back to canonical and emits
 *   `onChange` ONLY when the canonical document actually changed (deep compare)
 *   — this prevents render/onChange feedback loops.
 *
 * All non-trivial decision logic (`docsEqual`, `buildCanonicalEditorExtensions`)
 * is extracted into pure, unit-testable functions.
 */

import { useEffect, useRef } from "react";
import { useEditor, ReactNodeViewRenderer, type Editor } from "@tiptap/react";
import type { Extensions } from "@tiptap/core";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import { buildExtensions } from "@/lib/adaptation/tiptap/getEditorSchema";
import { canonicalToProseMirror, type PMNode } from "@/lib/adaptation/tiptap/fromCanonical";
import { tryProseMirrorToCanonical } from "@/lib/adaptation/tiptap/toCanonical";
import { UniqueId } from "@/lib/adaptation/tiptap/uniqueId";
import {
  InlineMathNode,
  BlockMathNode,
  ImageBlockNode,
  ScaffoldingNode,
  QuestionNode,
} from "@/lib/adaptation/tiptap/schema";
import { QuestionNodeView } from "./nodeviews/QuestionNodeView";
import { ImageNodeView } from "./nodeviews/ImageNodeView";
import { BlockMathNodeView } from "./nodeviews/BlockMathNodeView";
import { InlineMathNodeView } from "./nodeviews/InlineMathNodeView";
import { ScaffoldNodeView } from "./nodeviews/ScaffoldNodeView";

/** Deep structural equality for two canonical documents. */
export function docsEqual(a: CanonicalDocument, b: CanonicalDocument): boolean {
  return JSON.stringify(a) === JSON.stringify(b);
}

/**
 * Build the editor extension list: canonical schema + UniqueId, with the React
 * NodeViews bound to the custom nodes.
 */
export function buildCanonicalEditorExtensions() {
  // Eagerly resolve a React NodeView renderer per custom node. `addNodeView`
  // must be a function returning the renderer, so each entry closes over a
  // single pre-built renderer (built here so the wiring is covered by tests).
  const renderers: Record<string, () => unknown> = {
    [QuestionNode.name]: ReactNodeViewRenderer(QuestionNodeView),
    [ImageBlockNode.name]: ReactNodeViewRenderer(ImageNodeView),
    [BlockMathNode.name]: ReactNodeViewRenderer(BlockMathNodeView),
    [InlineMathNode.name]: ReactNodeViewRenderer(InlineMathNodeView),
    [ScaffoldingNode.name]: ReactNodeViewRenderer(ScaffoldNodeView),
  };

  const extensions = buildExtensions().map((ext) => {
    const renderer = renderers[ext.name];
    return renderer ? ext.extend({ addNodeView: () => renderer }) : ext;
  });

  return [...extensions, UniqueId];
}

export interface UseCanonicalEditorOptions {
  value: CanonicalDocument;
  onChange: (doc: CanonicalDocument) => void;
  disabled?: boolean;
  /**
   * Extra Tiptap extensions appended after the canonical set (e.g. the Estilo
   * step's current-block highlight). Kept optional so the Content step uses the
   * same hook with no extras.
   */
  extraExtensions?: Extensions;
  /** Called on every editor selection change (e.g. to track the current block). */
  onSelectionUpdate?: (editor: Editor) => void;
  /**
   * Called with a human-readable reason when an edit CANNOT be converted to the
   * canonical model (so nothing is emitted and nothing is autosaved), and with
   * `null` as soon as conversion succeeds again.
   *
   * Surfacing this is not optional polish: while conversion fails the sheet goes
   * on accepting keystrokes that are never persisted, and the wizard went on
   * displaying "Salvo" over them. Only called when the state actually flips, so
   * it is safe to drive React state with it.
   */
  onCaptureFailure?: (reason: string | null) => void;
}

export interface UseCanonicalEditorResult {
  editor: Editor | null;
}

export function useCanonicalEditor({
  value,
  onChange,
  disabled = false,
  extraExtensions,
  onSelectionUpdate,
  onCaptureFailure,
}: UseCanonicalEditorOptions): UseCanonicalEditorResult {
  // Seed content once and track the last-known canonical doc to guard emits.
  const initialContentRef = useRef<PMNode>(canonicalToProseMirror(value));
  const lastDocRef = useRef<CanonicalDocument>(value);
  // Last reported capture state, so the callback fires on transitions only.
  const captureFailureRef = useRef<string | null>(null);

  const reportCapture = (reason: string | null) => {
    if (captureFailureRef.current === reason) return;
    captureFailureRef.current = reason;
    onCaptureFailure?.(reason);
  };

  const editor = useEditor({
    extensions: [...buildCanonicalEditorExtensions(), ...(extraExtensions ?? [])],
    content: initialContentRef.current,
    editable: !disabled,
    onSelectionUpdate: ({ editor }) => onSelectionUpdate?.(editor),
    onUpdate: ({ editor }) => {
      // Ordinary edits produce transient-invalid states (all blocks deleted, a
      // half-typed construct). Validate without throwing: when the doc isn't
      // valid we keep the live ProseMirror state as the working source and do
      // NOT emit — the parent keeps its last valid document.
      //
      // But we say so. Emitting an invalid document would corrupt the save;
      // staying quiet about it is what made B8 costly — the sheet kept taking
      // keystrokes, the status kept reading "Salvo", and none of it persisted.
      const result = tryProseMirrorToCanonical(editor.getJSON() as PMNode);
      if (!result.ok) {
        // Warned unconditionally, not only in dev: `reportCapture` fires on the
        // transition, so this is one line per freeze, and it is the breadcrumb
        // that turns "it stopped saving" into a diagnosable report.
        console.warn("[canonical-editor] edição não capturada:", result.reason);
        reportCapture(result.reason);
        return;
      }
      reportCapture(null);
      const next = result.value;
      if (docsEqual(next, lastDocRef.current)) return;
      lastDocRef.current = next;
      onChange(next);
    },
  });

  // Follow a document that was replaced from OUTSIDE the editor — recovering a
  // crash mirror, an undo that rewrites a nested field, any state change the
  // sheet did not originate. Seeding only once left the folha showing the old
  // document after such a swap, and the next keystroke re-emitted that stale
  // doc, so the autosave wrote it back over the one the user had just chosen.
  //
  // The loop guard is `lastDocRef`: it holds whatever this editor last emitted,
  // so a value echoed back down by the parent compares equal and re-seeds
  // nothing. Only a document the editor did not produce gets through.
  useEffect(() => {
    if (!editor) return;
    if (docsEqual(value, lastDocRef.current)) return;
    lastDocRef.current = value;
    // emitUpdate=false: this is not a user edit, and emitting would bounce the
    // same document straight back up through onChange.
    editor.commands.setContent(canonicalToProseMirror(value), false);
  }, [editor, value]);

  return { editor };
}
