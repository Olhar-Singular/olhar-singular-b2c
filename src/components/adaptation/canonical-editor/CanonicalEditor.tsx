/**
 * CanonicalEditor — the content editing surface for a CanonicalDocument.
 *
 * Composes `CanonicalToolbar` + Tiptap `EditorContent`, driven by the
 * `useCanonicalEditor` hook (which wires the React NodeViews and the
 * canonical <-> ProseMirror mapping). Emits validated canonical docs via
 * `onChange` only when the content actually changes.
 */

import { EditorContent } from "@tiptap/react";
import { cn } from "@/lib/utils";
import type { CanonicalDocument } from "@/lib/adaptation/canonical/schema";
import "katex/dist/katex.min.css";
import { useCanonicalEditor } from "./useCanonicalEditor";
import { CanonicalToolbar } from "./CanonicalToolbar";

export interface CanonicalEditorProps {
  value: CanonicalDocument;
  onChange: (doc: CanonicalDocument) => void;
  disabled?: boolean;
}

export function CanonicalEditor({ value, onChange, disabled = false }: CanonicalEditorProps) {
  const { editor } = useCanonicalEditor({ value, onChange, disabled });

  if (!editor) return null;

  return (
    <div className={cn("overflow-hidden rounded-md border border-input bg-background", disabled && "opacity-60")}>
      <CanonicalToolbar editor={editor} disabled={disabled} />
      <EditorContent editor={editor} className="px-3 py-2" />
    </div>
  );
}

export default CanonicalEditor;
