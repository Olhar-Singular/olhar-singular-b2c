/**
 * CanonicalToolbar — insert-block buttons for the canonical editor (questão,
 * imagem, fórmula, andaime, divisória). Inserts build node JSON via `commands.ts`
 * and call `editor.commands.insertContent`.
 *
 * Text formatting (bold / italic / underline / strike / color) is NOT here: it
 * lives in the Estilo step, exposed only when the editor runs in `"style"` mode
 * (see `EditorMode`). The Content step stays plain: text + math + structure.
 */

import {
  HelpCircle,
  ImageIcon,
  Sigma,
  ListTree,
  Minus,
} from "lucide-react";
import type { Editor } from "@tiptap/react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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

interface CanonicalToolbarProps {
  editor: Editor;
  disabled?: boolean;
}

function ToolbarButton({
  onClick,
  title,
  disabled,
  children,
}: {
  onClick: () => void;
  title: string;
  disabled?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      className="h-7 w-7"
      onClick={onClick}
      title={title}
      aria-label={title}
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
      {/* v8 ignore start -- Radix DropdownMenuItem onClick fires inside a Portal
          jsdom doesn't open via fireEvent; the question kinds come from the
          tested QUESTION_KINDS list. */}
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
