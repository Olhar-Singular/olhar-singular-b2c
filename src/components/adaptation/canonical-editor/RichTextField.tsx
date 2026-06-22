/**
 * RichTextField — a single-paragraph inline rich-text editor that edits and
 * emits canonical `RichText`.
 *
 * Used by the answer editors (alternatives, true/false, checkbox, matching,
 * ordering items, table cells) and the image caption — anywhere the edited
 * value is `RichText`. Replaces the plain `<Input>`s that flattened bold /
 * italic / color / inline-math into plain text.
 *
 * Extensions are a MINIMAL inline-only set (Document restricted to exactly one
 * paragraph, Paragraph, Text, the four inline marks, TextStyle+Color, and the
 * canonical InlineMath atom). NO block nodes — so the field can never produce a
 * heading/list/divider that the single-paragraph RichText model can't hold.
 *
 * RichText <-> ProseMirror-inline mapping reuses the proven, round-trip-tested
 * `richTextToPM` / `pmToRichText` mappers. `onChange` only fires when the mapped
 * RichText actually changed (deep compare) to avoid render/onChange loops.
 *
 * No toolbar chrome — selection formatting lives in the folha's BubbleMenu
 * (§6.2). Inline marks (bold / italic / underline / strike / color) and inline
 * math are still parsed and rendered (extensions stay) but insertion of new
 * math nodes is reserved for a future dedicated UI. The value contract is
 * unchanged: the field always emits canonical `RichText`.
 */

import { useRef } from "react";
import { useEditor, EditorContent, BubbleMenu, ReactNodeViewRenderer } from "@tiptap/react";
import { SelectionBubble } from "./SelectionBubble";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import { FontSize } from "@/lib/tiptap/fontSizeExtension";
import { cn } from "@/lib/utils";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { InlineMathNode } from "@/lib/adaptation/tiptap/schema";
import { type PMNode } from "@/lib/adaptation/tiptap/fromCanonical";
import { InlineMathNodeView } from "./nodeviews/InlineMathNodeView";
import { docFromRichText, richTextFromDoc, richTextEqual } from "./richTextFieldMapping";

/** Build the InlineMath node with its React NodeView bound (so math renders). */
function buildInlineMathExtension() {
  const renderer = ReactNodeViewRenderer(InlineMathNodeView);
  // The `addNodeView` callback is invoked by Tiptap when wiring the real editor;
  // it is unreachable under jsdom because `@tiptap/react` is mocked in tests.
  /* v8 ignore next */
  return InlineMathNode.extend({ addNodeView: () => renderer });
}

/** Single-paragraph Document — content is exactly one paragraph, no blocks. */
const SingleParagraphDocument = Document.extend({ content: "paragraph" });

interface RichTextFieldProps {
  value: RichText;
  onChange: (rt: RichText) => void;
  placeholder?: string;
  disabled?: boolean;
  /**
   * Non-editable without the opacity/fading of `disabled`. Used for the
   * enunciado in QuestionPreview: text is locked but renders at full opacity
   * so the folha at rest looks like the printed document.
   */
  readOnly?: boolean;
  ariaLabel?: string;
  /**
   * Worksheet-faithful variant: no border and no toolbar — just editable text.
   * Used in the question PREVIEW so the folha at rest reads like the printed PDF
   * (plano §6.3 / D2) while still being click-to-edit. The card uses the default.
   */
  plain?: boolean;
  /** Suppress the BubbleMenu formatting bar — used in image caption/alt fields. */
  noBubble?: boolean;
}

export function RichTextField({
  value,
  onChange,
  placeholder = "Digite o texto...",
  disabled = false,
  readOnly = false,
  ariaLabel,
  plain = false,
  noBubble = false,
}: RichTextFieldProps) {
  // Seed once; track the last emitted RichText to guard against feedback loops.
  const initialContentRef = useRef<PMNode>(docFromRichText(value));
  const lastValueRef = useRef<RichText>(value);

  const editor = useEditor({
    extensions: [
      SingleParagraphDocument,
      Paragraph,
      Text,
      Bold,
      Italic,
      Underline,
      Strike,
      TextStyle,
      Color,
      FontSize,
      buildInlineMathExtension(),
    ],
    content: initialContentRef.current,
    editable: !disabled && !readOnly,
    onUpdate: ({ editor }) => {
      const next = richTextFromDoc(editor.getJSON() as PMNode);
      if (richTextEqual(next, lastValueRef.current)) return;
      lastValueRef.current = next;
      onChange(next);
    },
    editorProps: {
      attributes: {
        class: cn(
          // `rich-text-field` marks this as a NESTED inline editor so the folha's
          // top-level block labels (`.tiptap > p` ⇒ "Instrução" etc., in index.css)
          // never leak onto answer fields. Wrap long answers instead of scrolling.
          "rich-text-field w-full px-2 py-1 text-sm focus:outline-none min-h-[2rem] whitespace-normal break-words",
          disabled && "opacity-50 cursor-not-allowed",
          readOnly && "cursor-default"
        ),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        "data-placeholder": placeholder,
      },
    },
  });

  if (!editor) return null;

  return (
    <div className={cn("flex-1 min-w-0", !plain && "rounded-md border border-input bg-background", disabled && "opacity-60")}>
      {!disabled && !readOnly && !noBubble && (
        <BubbleMenu editor={editor} tippyOptions={{ duration: 100, appendTo: "parent" }}>
          <SelectionBubble editor={editor} />
        </BubbleMenu>
      )}
      <EditorContent editor={editor} />
    </div>
  );
}
