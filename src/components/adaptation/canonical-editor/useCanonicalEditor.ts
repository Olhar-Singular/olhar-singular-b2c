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

import { useRef } from "react";
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
}: UseCanonicalEditorOptions): UseCanonicalEditorResult {
  // Seed content once and track the last-known canonical doc to guard emits.
  const initialContentRef = useRef<PMNode>(canonicalToProseMirror(value));
  const lastDocRef = useRef<CanonicalDocument>(value);

  const editor = useEditor({
    extensions: [...buildCanonicalEditorExtensions(), ...(extraExtensions ?? [])],
    content: initialContentRef.current,
    editable: !disabled,
    onSelectionUpdate: ({ editor }) => onSelectionUpdate?.(editor),
    onUpdate: ({ editor }) => {
      // Ordinary edits produce transient-invalid states (image with empty src,
      // cleared math latex, all blocks deleted). Validate without throwing: when
      // the doc isn't valid we keep the live ProseMirror state as the working
      // source and do NOT emit — the parent keeps its last valid document.
      const result = tryProseMirrorToCanonical(editor.getJSON() as PMNode);
      if (!result.ok) return;
      const next = result.value;
      if (docsEqual(next, lastDocRef.current)) return;
      lastDocRef.current = next;
      onChange(next);
    },
  });

  return { editor };
}
