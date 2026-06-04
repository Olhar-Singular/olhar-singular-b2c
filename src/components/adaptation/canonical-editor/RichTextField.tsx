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
 */

import { useRef } from "react";
import { useEditor, EditorContent, ReactNodeViewRenderer } from "@tiptap/react";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Strike from "@tiptap/extension-strike";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import {
  Bold as BoldIcon,
  Italic as ItalicIcon,
  Underline as UnderlineIcon,
  Strikethrough,
  Palette,
  Sigma,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import type { RichText } from "@/lib/adaptation/canonical/schema";
import { ALLOWED_COLORS } from "@/lib/adaptation/canonical/colors";
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
  ariaLabel?: string;
}

export function RichTextField({
  value,
  onChange,
  placeholder = "Digite o texto...",
  disabled = false,
  ariaLabel,
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
      buildInlineMathExtension(),
    ],
    content: initialContentRef.current,
    editable: !disabled,
    onUpdate: ({ editor }) => {
      const next = richTextFromDoc(editor.getJSON() as PMNode);
      if (richTextEqual(next, lastValueRef.current)) return;
      lastValueRef.current = next;
      onChange(next);
    },
    editorProps: {
      attributes: {
        class: cn(
          "px-2 py-1 text-sm focus:outline-none min-h-[2rem]",
          disabled && "opacity-50 cursor-not-allowed"
        ),
        ...(ariaLabel ? { "aria-label": ariaLabel } : {}),
        "data-placeholder": placeholder,
      },
    },
  });

  if (!editor) return null;

  const insertMath = () => {
    const latex = window.prompt("LaTeX inline:");
    if (latex === null || latex.trim() === "") return;
    editor.chain().focus().insertContent({ type: "inlineMath", attrs: { latex } }).run();
  };

  return (
    <div className={cn("flex-1 rounded-md border border-input bg-background", disabled && "opacity-60")}>
      <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-1 py-0.5">
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6", editor.isActive("bold") && "bg-accent text-accent-foreground")}
          onClick={() => editor.chain().focus().toggleBold().run()}
          disabled={disabled}
          title="Negrito"
          aria-label="Negrito"
        >
          <BoldIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6", editor.isActive("italic") && "bg-accent text-accent-foreground")}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          disabled={disabled}
          title="Itálico"
          aria-label="Itálico"
        >
          <ItalicIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6", editor.isActive("underline") && "bg-accent text-accent-foreground")}
          onClick={() => editor.chain().focus().toggleUnderline().run()}
          disabled={disabled}
          title="Sublinhado"
          aria-label="Sublinhado"
        >
          <UnderlineIcon className="h-3.5 w-3.5" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-6 w-6", editor.isActive("strike") && "bg-accent text-accent-foreground")}
          onClick={() => editor.chain().focus().toggleStrike().run()}
          disabled={disabled}
          title="Tachado"
          aria-label="Tachado"
        >
          <Strikethrough className="h-3.5 w-3.5" />
        </Button>

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <Button type="button" variant="ghost" size="icon" className="h-6 w-6" title="Cor do texto" aria-label="Cor do texto">
              <Palette className="h-3.5 w-3.5" />
            </Button>
          </DropdownMenuTrigger>
          {/* v8 ignore start -- Radix DropdownMenuItem onClick handlers fire
              inside a Portal that jsdom doesn't open via fireEvent.click */}
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {ALLOWED_COLORS.map((color) => (
              <DropdownMenuItem
                key={color}
                onClick={() => editor.chain().focus().setColor(color).run()}
                className="flex items-center gap-2"
              >
                <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color }} />
                {color}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetColor().run()} className="text-muted-foreground">
              Cor padrão
            </DropdownMenuItem>
          </DropdownMenuContent>
          {/* v8 ignore stop */}
        </DropdownMenu>

        <Button
          type="button"
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          onClick={insertMath}
          disabled={disabled}
          title="Inserir fórmula inline"
          aria-label="Inserir fórmula inline"
        >
          <Sigma className="h-3.5 w-3.5" />
        </Button>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}
