/**
 * SelectionBubbleMenu — inline formatting on a text selection (Estilo step only).
 *
 * When the user selects a non-empty range of text in the style-mode editor, a
 * floating Tiptap `BubbleMenu` shows toggles that apply INLINE marks to the
 * selection via the editor chain: Negrito / Itálico / Sublinhado / Tachado, plus
 * a Cor picker (the `ALLOWED_COLORS` allowlist) that sets/unsets the `TextStyle`
 * color. This is the third formatting level (document → block → selection); it is
 * mounted ONLY by the Estilo editor, so the Content editor never gets it.
 *
 * Geometry/visibility is delegated to `BubbleMenu` (tippy). The only browser
 * coupling is the `shouldShow` predicate, read defensively against an empty
 * selection so it never throws.
 */

import { BubbleMenu } from "@tiptap/react";
import type { Editor } from "@tiptap/react";
import { Bold, Italic, Underline as UnderlineIcon, Strikethrough } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { ALLOWED_COLORS } from "@/lib/adaptation/canonical/colors";

type Props = {
  editor: Editor | null;
};

/**
 * Show the bubble menu only when the selection covers a non-empty text range.
 * Guarded against an empty/cursor selection so it never throws.
 */
// eslint-disable-next-line react-refresh/only-export-components -- pure predicate colocated with the component it gates (kept testable without a browser)
export function shouldShowBubble({
  editor,
  from,
  to,
}: {
  editor: Editor;
  from: number;
  to: number;
}): boolean {
  return from !== to && !editor.state.selection.empty;
}

const MARKS: {
  name: string;
  label: string;
  icon: typeof Bold;
  run: (editor: Editor) => void;
}[] = [
  { name: "bold", label: "Negrito", icon: Bold, run: (e) => e.chain().focus().toggleBold().run() },
  {
    name: "italic",
    label: "Itálico",
    icon: Italic,
    run: (e) => e.chain().focus().toggleItalic().run(),
  },
  {
    name: "underline",
    label: "Sublinhado",
    icon: UnderlineIcon,
    run: (e) => e.chain().focus().toggleUnderline().run(),
  },
  {
    name: "strike",
    label: "Tachado",
    icon: Strikethrough,
    run: (e) => e.chain().focus().toggleStrike().run(),
  },
];

export function SelectionBubbleMenu({ editor }: Props) {
  if (!editor) return null;

  const setColor = (value: string) => {
    if (value === "__none__") {
      editor.chain().focus().unsetColor().run();
    } else {
      editor.chain().focus().setColor(value).run();
    }
  };

  return (
    <BubbleMenu
      editor={editor}
      shouldShow={shouldShowBubble}
      className="flex items-center gap-0.5 rounded-md border border-input bg-background p-1 shadow-md"
    >
      {MARKS.map(({ name, label, icon: Icon, run }) => (
        <Button
          key={name}
          type="button"
          variant="ghost"
          size="icon"
          className={cn("h-7 w-7", editor.isActive(name) && "bg-accent text-accent-foreground")}
          aria-label={label}
          aria-pressed={editor.isActive(name)}
          title={label}
          onClick={() => run(editor)}
        >
          <Icon className="h-3.5 w-3.5" />
        </Button>
      ))}
      <select
        aria-label="Cor"
        className="h-7 rounded-md border border-input bg-background px-1.5 text-xs"
        value=""
        onChange={(e) => setColor(e.target.value)}
      >
        <option value="" disabled>
          Cor…
        </option>
        <option value="__none__">Remover cor</option>
        {ALLOWED_COLORS.map((c) => (
          <option key={c} value={c}>
            {c}
          </option>
        ))}
      </select>
    </BubbleMenu>
  );
}

export default SelectionBubbleMenu;
