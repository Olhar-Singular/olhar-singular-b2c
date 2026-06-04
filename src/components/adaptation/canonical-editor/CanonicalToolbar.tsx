/**
 * CanonicalToolbar — inline mark buttons + insert-block buttons for the
 * canonical editor. Mark toggles use `editor.chain()`; inserts build node JSON
 * via `commands.ts` and call `editor.commands.insertContent`.
 */

import {
  Bold,
  Italic,
  Underline as UnderlineIcon,
  Strikethrough,
  Palette,
  HelpCircle,
  ImageIcon,
  Sigma,
  ListTree,
  Minus,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";
import { ALLOWED_COLORS } from "@/lib/adaptation/canonical/colors";
import {
  buildQuestionNode,
  buildImageNode,
  buildMathNode,
  buildScaffoldNode,
  buildDivider,
  type QuestionKind,
} from "./commands";

const QUESTION_KINDS: { kind: QuestionKind; label: string }[] = [
  { kind: "open", label: "Dissertativa" },
  { kind: "multipleChoice", label: "Múltipla escolha" },
  { kind: "trueFalse", label: "Verdadeiro/Falso" },
  { kind: "checkbox", label: "Caixas de seleção" },
  { kind: "matching", label: "Associação" },
  { kind: "ordering", label: "Ordenação" },
  { kind: "fillBlank", label: "Lacunas" },
  { kind: "table", label: "Tabela" },
];

// Only the text colors (first 6) make sense for the foreground color picker.
const TEXT_COLORS = ALLOWED_COLORS.slice(0, 6);

interface CanonicalToolbarProps {
  editor: Editor;
  disabled?: boolean;
}

function ToolbarButton({
  onClick,
  active,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  active?: boolean;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className={cn("h-7 w-7", active && "bg-accent text-accent-foreground")}
      onClick={onClick}
      title={title}
      disabled={disabled}
    >
      {children}
    </Button>
  );
}

export function CanonicalToolbar({ editor, disabled = false }: CanonicalToolbarProps) {
  const insert = (node: unknown) => editor.chain().focus().insertContent(node).run();

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-border bg-muted/30 px-1.5 py-1">
      <ToolbarButton onClick={() => editor.chain().focus().toggleBold().run()} active={editor.isActive("bold")} title="Negrito" disabled={disabled}>
        <Bold className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleItalic().run()} active={editor.isActive("italic")} title="Itálico" disabled={disabled}>
        <Italic className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleUnderline().run()} active={editor.isActive("underline")} title="Sublinhado" disabled={disabled}>
        <UnderlineIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => editor.chain().focus().toggleStrike().run()} active={editor.isActive("strike")} title="Tachado" disabled={disabled}>
        <Strikethrough className="h-3.5 w-3.5" />
      </ToolbarButton>

      {/* v8 ignore start -- Radix DropdownMenuItem onClick fires inside a Portal
          jsdom doesn't open via fireEvent; the color values come from the tested
          ALLOWED_COLORS allowlist. */}
      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button type="button" variant="ghost" size="icon" className="h-7 w-7" title="Cor do texto">
            <Palette className="h-3.5 w-3.5" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[140px]">
          {TEXT_COLORS.map((color) => (
            <DropdownMenuItem key={color} onClick={() => editor.chain().focus().setColor(color).run()} className="flex items-center gap-2">
              <span className="h-4 w-4 rounded-full border border-border" style={{ backgroundColor: color }} />
              {color}
            </DropdownMenuItem>
          ))}
          <DropdownMenuItem onClick={() => editor.chain().focus().unsetColor().run()} className="text-muted-foreground">
            Cor padrão
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Separator orientation="vertical" className="mx-1 h-5" />

      <DropdownMenu>
        <DropdownMenuTrigger asChild disabled={disabled}>
          <Button type="button" variant="ghost" size="sm" className="h-7 gap-1 px-1.5 text-xs" title="Inserir questão">
            <HelpCircle className="h-3.5 w-3.5" /> Questão
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="min-w-[180px]">
          {QUESTION_KINDS.map(({ kind, label }) => (
            <DropdownMenuItem key={kind} onClick={() => insert(buildQuestionNode(kind))}>
              {label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
      {/* v8 ignore stop */}

      <ToolbarButton onClick={() => insert(buildImageNode(""))} title="Inserir imagem" disabled={disabled}>
        <ImageIcon className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => insert(buildMathNode(undefined))} title="Inserir fórmula" disabled={disabled}>
        <Sigma className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => insert(buildScaffoldNode())} title="Inserir andaime" disabled={disabled}>
        <ListTree className="h-3.5 w-3.5" />
      </ToolbarButton>
      <ToolbarButton onClick={() => insert(buildDivider())} title="Inserir divisória" disabled={disabled}>
        <Minus className="h-3.5 w-3.5" />
      </ToolbarButton>
    </div>
  );
}
