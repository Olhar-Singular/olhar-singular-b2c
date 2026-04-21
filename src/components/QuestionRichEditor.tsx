import { useState, useEffect } from "react";
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Underline from "@tiptap/extension-underline";
import Placeholder from "@tiptap/extension-placeholder";
import Highlight from "@tiptap/extension-highlight";
import TextStyle from "@tiptap/extension-text-style";
import Color from "@tiptap/extension-color";
import FontFamily from "@tiptap/extension-font-family";
import Subscript from "@tiptap/extension-subscript";
import Superscript from "@tiptap/extension-superscript";
import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  List,
  ListOrdered,
  Undo,
  Redo,
  Highlighter,
  Palette,
  Type,
  Subscript as SubscriptIcon,
  Superscript as SuperscriptIcon,
  ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { LatexExtension, latexStyles } from "@/lib/tiptap/latexExtension";
import "katex/dist/katex.min.css";

const HIGHLIGHT_COLORS = [
  { name: "Amarelo", value: "#FEF08A", label: "Destaque geral" },
  { name: "Verde", value: "#BBF7D0", label: "Instruções" },
  { name: "Azul", value: "#BFDBFE", label: "Informação" },
  { name: "Rosa", value: "#FBCFE8", label: "Atenção" },
  { name: "Laranja", value: "#FED7AA", label: "Importante" },
  { name: "Roxo", value: "#DDD6FE", label: "Dica" },
];

const TEXT_COLORS = [
  { name: "Padrão", value: "#1F2937" },
  { name: "Vermelho", value: "#DC2626" },
  { name: "Azul", value: "#2563EB" },
  { name: "Verde", value: "#16A34A" },
  { name: "Roxo", value: "#9333EA" },
  { name: "Cinza", value: "#6B7280" },
];

const FONT_FAMILIES = [
  { name: "Padrão", value: "inherit" },
  { name: "OpenDyslexic", value: "OpenDyslexic, sans-serif", accessible: true },
  { name: "Arial", value: "Arial, sans-serif" },
  { name: "Verdana", value: "Verdana, sans-serif" },
  { name: "Courier", value: "Courier New, monospace" },
];

const FONT_SIZES = [
  { name: "Pequeno", value: "0.875em" },
  { name: "Normal", value: "1em" },
  { name: "Grande", value: "1.25em" },
  { name: "Extra Grande", value: "1.5em" },
];

interface QuestionRichEditorProps {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  minHeight?: number;
  compact?: boolean;
  disabled?: boolean;
}

function ToolbarButton({
  onClick,
  active,
  title,
  children,
  disabled,
  compact,
  className,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  children: React.ReactNode;
  disabled?: boolean;
  compact?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn(
        compact ? "h-6 w-6" : "h-7 w-7",
        active && "bg-accent text-accent-foreground",
        className
      )}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

let stylesInjected = false;
function injectStyles() {
  if (stylesInjected || typeof document === "undefined") return;
  const style = document.createElement("style");
  style.textContent = `
    ${latexStyles}
    .ProseMirror mark { border-radius: 2px; padding: 0 2px; }
    .ProseMirror sub { font-size: 0.75em; vertical-align: sub; }
    .ProseMirror sup { font-size: 0.75em; vertical-align: super; }
  `;
  document.head.appendChild(style);
  stylesInjected = true;
}

const FontSize = TextStyle.extend({
  addAttributes() {
    return {
      ...this.parent?.(),
      fontSize: {
        default: null,
        parseHTML: (element) => element.style.fontSize || null,
        renderHTML: (attributes) => {
          if (!attributes.fontSize) return {};
          return { style: `font-size: ${attributes.fontSize}` };
        },
      },
    };
  },
});

export default function QuestionRichEditor({
  value,
  onChange,
  placeholder = "Digite o texto...",
  minHeight = 100,
  compact = false,
  disabled = false,
}: QuestionRichEditorProps) {
  const [, setTick] = useState(0);

  useEffect(() => { injectStyles(); }, []);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: false }),
      Underline,
      Placeholder.configure({ placeholder }),
      Highlight.configure({ multicolor: true }),
      TextStyle,
      Color,
      FontFamily,
      FontSize,
      Subscript,
      Superscript,
      LatexExtension,
    ],
    content: value,
    editable: !disabled,
    onUpdate: ({ editor }) => { onChange(editor.getHTML()); },
    onSelectionUpdate: () => { setTick((t) => t + 1); },
    editorProps: {
      attributes: {
        class: cn(
          "prose prose-sm dark:prose-invert max-w-none px-3 py-2 focus:outline-none",
          "prose-p:my-1 prose-ul:my-1 prose-ol:my-1 prose-li:my-0.5",
          disabled && "opacity-50 cursor-not-allowed"
        ),
        style: `min-height: ${minHeight}px`,
      },
    },
  });

  if (!editor) return null;

  const iconSize = compact ? "w-3 h-3" : "w-3.5 h-3.5";
  const separatorClass = compact ? "h-4 mx-0.5" : "h-5 mx-1";

  return (
    <div className={cn("border border-input rounded-md overflow-hidden bg-background", disabled && "opacity-60")}>
      <div className={cn("flex flex-wrap items-center gap-0.5 px-1.5 border-b border-border bg-muted/30", compact ? "py-0.5" : "py-1")}>
        <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito (Ctrl+B)" disabled={disabled} compact={compact}>
          <Bold className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico (Ctrl+I)" disabled={disabled} compact={compact}>
          <Italic className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado (Ctrl+U)" disabled={disabled} compact={compact}>
          <UnderlineIcon className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado" disabled={disabled} compact={compact}>
          <Strikethrough className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className={separatorClass} />

        <ToolbarButton onClick={() => editor.chain().focus().toggleSubscript().run()} active={editor.isActive("subscript")} title="Subscrito" disabled={disabled} compact={compact}>
          <SubscriptIcon className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleSuperscript().run()} active={editor.isActive("superscript")} title="Sobrescrito" disabled={disabled} compact={compact}>
          <SuperscriptIcon className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className={separatorClass} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <Button type="button" variant="ghost" size="icon" className={cn(compact ? "h-6 w-6" : "h-7 w-7", editor.isActive("highlight") && "bg-accent")} title="Marca-texto">
              <Highlighter className={iconSize} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[160px]">
            {HIGHLIGHT_COLORS.map((color) => (
              <DropdownMenuItem key={color.value} onClick={() => editor.chain().focus().toggleHighlight({ color: color.value }).run()} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded border border-border" style={{ backgroundColor: color.value }} />
                <span className="flex-1">{color.name}</span>
                <span className="text-xs text-muted-foreground">{color.label}</span>
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetHighlight().run()} className="text-muted-foreground">
              Remover destaque
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <Button type="button" variant="ghost" size="icon" className={cn(compact ? "h-6 w-6" : "h-7 w-7")} title="Cor do texto">
              <Palette className={iconSize} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {TEXT_COLORS.map((color) => (
              <DropdownMenuItem key={color.value} onClick={() => editor.chain().focus().setColor(color.value).run()} className="flex items-center gap-2">
                <span className="w-4 h-4 rounded-full border border-border" style={{ backgroundColor: color.value }} />
                {color.name}
              </DropdownMenuItem>
            ))}
            <DropdownMenuItem onClick={() => editor.chain().focus().unsetColor().run()} className="text-muted-foreground">
              Cor padrão
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className={separatorClass} />

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <Button type="button" variant="ghost" className={cn("gap-0.5 px-1.5", compact ? "h-6 text-xs" : "h-7 text-xs")} title="Fonte">
              <Type className={iconSize} />
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[180px]">
            {FONT_FAMILIES.map((font) => (
              <DropdownMenuItem
                key={font.value}
                onClick={() => font.value === "inherit" ? editor.chain().focus().unsetFontFamily().run() : editor.chain().focus().setFontFamily(font.value).run()}
                className="flex items-center gap-2"
                style={{ fontFamily: font.value }}
              >
                {font.name}
                {font.accessible && <span className="ml-auto text-[10px] bg-green-100 text-green-700 px-1 rounded">Acessível</span>}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <DropdownMenu>
          <DropdownMenuTrigger asChild disabled={disabled}>
            <Button type="button" variant="ghost" className={cn("gap-0.5 px-1.5", compact ? "h-6 text-xs" : "h-7 text-xs")} title="Tamanho">
              <span className="text-[10px] font-medium">Aa</span>
              <ChevronDown className="w-3 h-3" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" className="min-w-[140px]">
            {FONT_SIZES.map((size) => (
              <DropdownMenuItem
                key={size.value}
                onClick={() => size.value === "1em" ? editor.chain().focus().unsetMark("textStyle").run() : editor.chain().focus().setMark("textStyle", { fontSize: size.value }).run()}
                style={{ fontSize: size.value }}
              >
                {size.name}
              </DropdownMenuItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Separator orientation="vertical" className={separatorClass} />

        <ToolbarButton onClick={() => editor.chain().focus().toggleBulletList().run()} active={editor.isActive("bulletList")} title="Lista" disabled={disabled} compact={compact}>
          <List className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().toggleOrderedList().run()} active={editor.isActive("orderedList")} title="Lista numerada" disabled={disabled} compact={compact}>
          <ListOrdered className={iconSize} />
        </ToolbarButton>

        <Separator orientation="vertical" className={separatorClass} />

        <ToolbarButton onClick={() => editor.chain().focus().undo().run()} disabled={disabled || !editor.can().undo()} title="Desfazer (Ctrl+Z)" compact={compact}>
          <Undo className={iconSize} />
        </ToolbarButton>
        <ToolbarButton onClick={() => editor.chain().focus().redo().run()} disabled={disabled || !editor.can().redo()} title="Refazer (Ctrl+Y)" compact={compact}>
          <Redo className={iconSize} />
        </ToolbarButton>
      </div>

      <EditorContent editor={editor} />
    </div>
  );
}

export function isHtmlContent(content: string): boolean {
  return /<(p|strong|em|u|s|ul|ol|li|br|mark|span|sub|sup)\b/i.test(content);
}

export function textToHtml(text: string): string {
  if (isHtmlContent(text)) return text;
  return text.split("\n").map((line) => `<p>${line || "<br>"}</p>`).join("");
}

export function htmlToText(html: string): string {
  if (!isHtmlContent(html)) return html;
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p><p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&")
    .trim();
}
