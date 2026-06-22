/**
 * SelectionBubble — barra de formatação do trecho selecionado (plano §6.2, D7).
 *
 * O conteúdo do BubbleMenu do Tiptap (montado no StepReview): negrito, itálico,
 * sublinhado, tachado, A-/A+ de fonte por seleção, cores da allowlist e remover cor.
 * NADA além disso — os dois únicos alcances de formatação são este (seleção) e o
 * popover Aparência (documento inteiro).
 *
 * As marcas (bold/italic/underline/strike + color/fontSize via textStyle) já fazem
 * round-trip lossless no canônico — este componente só aciona os comandos. Os
 * swatches reusam `TEXT_COLORS` (allowlist do schema), nunca hex avulso.
 */
import { Bold, Italic, Underline, Strikethrough, Ban } from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { TEXT_COLORS } from "@/lib/adaptation/canonical/colors";

type Props = { editor: Editor };

const DEFAULT_FONT_SIZE_PX = 16;
const MIN_FONT_SIZE_PX = 8;
const MAX_FONT_SIZE_PX = 72;

/** Marcas inline com toggle e estado ativo. */
const MARKS = [
  { name: "bold", label: "Negrito", Icon: Bold, toggle: (e: Editor) => e.chain().focus().toggleBold().run() },
  { name: "italic", label: "Itálico", Icon: Italic, toggle: (e: Editor) => e.chain().focus().toggleItalic().run() },
  {
    name: "underline",
    label: "Sublinhado",
    Icon: Underline,
    toggle: (e: Editor) => e.chain().focus().toggleUnderline().run(),
  },
  {
    name: "strike",
    label: "Tachado",
    Icon: Strikethrough,
    toggle: (e: Editor) => e.chain().focus().toggleStrike().run(),
  },
] as const;

export function SelectionBubble({ editor }: Props) {
  const rawFontSize = editor.getAttributes("textStyle").fontSize as string | null | undefined;
  const parsedPx = rawFontSize ? parseFloat(rawFontSize) : NaN;
  const currentPx = isNaN(parsedPx) ? DEFAULT_FONT_SIZE_PX : Math.round(parsedPx);

  const handleFontSizeStep = (delta: number) => {
    const next = Math.max(MIN_FONT_SIZE_PX, Math.min(MAX_FONT_SIZE_PX, currentPx + delta));
    editor.chain().focus().setFontSize(`${next}px`).run();
  };

  return (
    <div className="flex items-center gap-0.5 rounded-md border border-surface-line-2 bg-surface-paper p-1 shadow-md">
      {MARKS.map(({ name, label, Icon, toggle }) => (
        <Button
          key={name}
          type="button"
          size="icon"
          variant="ghost"
          className={cn("h-7 w-7", editor.isActive(name) && "bg-surface-accent-soft text-surface-accent")}
          aria-label={label}
          aria-pressed={editor.isActive(name)}
          onClick={() => toggle(editor)}
        >
          <Icon className="h-4 w-4" />
        </Button>
      ))}

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Diminuir fonte"
        onClick={() => handleFontSizeStep(-1)}
      >
        <span className="text-xs font-bold leading-none select-none">A-</span>
      </Button>
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Aumentar fonte"
        onClick={() => handleFontSizeStep(1)}
      >
        <span className="text-sm font-bold leading-none select-none">A+</span>
      </Button>

      <span className="mx-0.5 h-5 w-px bg-surface-line-2" aria-hidden="true" />

      {TEXT_COLORS.map((color) => (
        <button
          key={color}
          type="button"
          className={cn(
            "h-5 w-5 rounded-full border border-surface-line-2",
            editor.isActive("textStyle", { color }) && "ring-2 ring-surface-accent ring-offset-1",
          )}
          style={{ backgroundColor: color }}
          aria-label={`Cor ${color}`}
          aria-pressed={editor.isActive("textStyle", { color })}
          onClick={() => editor.chain().focus().setColor(color).run()}
        />
      ))}

      <Button
        type="button"
        size="icon"
        variant="ghost"
        className="h-7 w-7"
        aria-label="Remover cor"
        onClick={() => editor.chain().focus().unsetColor().run()}
      >
        <Ban className="h-4 w-4" />
      </Button>
    </div>
  );
}

export default SelectionBubble;
