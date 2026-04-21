import { useState, useCallback, useRef, useEffect } from "react";
import { ChevronDown, Undo2, Redo2, ImageIcon } from "lucide-react";

type InsertType =
  | "section"
  | "mc"
  | "multi"
  | "open"
  | "fill"
  | "tf"
  | "match"
  | "order"
  | "table"
  | "instruction"
  | "separator";

type Props = {
  textareaRef: React.RefObject<HTMLTextAreaElement | null>;
  onInsert: (text: string) => void;
  onWrap: (before: string, after: string) => void;
  getNextQuestionNumber: () => number;
  onUndo: () => void;
  onRedo: () => void;
  canUndo: boolean;
  canRedo: boolean;
  onImageClick?: () => void;
};

const TEMPLATES: Record<InsertType, (n: number) => string> = {
  section: () => "\n# Nova Seção\n",
  mc: (n) =>
    `\n${n}) Enunciado da questão\na) Primeira opção\nb*) Opção correta\nc) Terceira opção\nd) Quarta opção\n`,
  multi: (n) =>
    `\n${n}) Selecione **todas** as corretas:\n[x] Opção correta 1\n[ ] Opção errada\n[x] Opção correta 2\n[ ] Outra errada\n`,
  open: (n) => `\n${n}) Explique com suas palavras:\n[linhas:5]\n`,
  fill: (n) =>
    `\n${n}) Complete: O maior planeta é ___.\n[banco: Júpiter, Marte, Saturno, Vênus]\n`,
  tf: (n) =>
    `\n${n}) Marque Verdadeiro ou Falso:\n( ) Primeira afirmação\n( ) Segunda afirmação\n( ) Terceira afirmação\n`,
  match: (n) =>
    `\n${n}) Associe as colunas:\nBrasil -- Brasília\nArgentina -- Buenos Aires\nChile -- Santiago\n`,
  order: (n) =>
    `\n${n}) Ordene do menor para o maior:\n[1] Célula\n[2] Tecido\n[3] Órgão\n[4] Sistema\n`,
  table: (n) =>
    `\n${n}) Marque a resposta correta para cada item:\n| | Sim | Não | Talvez |\n| Item 1 | ( ) | ( ) | ( ) |\n| Item 2 | ( ) | ( ) | ( ) |\n| Item 3 | ( ) | ( ) | ( ) |\n`,
  instruction: () => "\n> Atenção: leia com cuidado antes de responder.\n",
  separator: () => "\n---\n",
};

const INSERT_ITEMS = [
  { type: "section" as InsertType, label: "Seção", icon: "◼", color: "text-violet-700" },
  { type: "mc" as InsertType, label: "Múltipla escolha", icon: "◉", color: "text-blue-700" },
  { type: "multi" as InsertType, label: "Multi-resposta", icon: "☑", color: "text-cyan-700" },
  { type: "open" as InsertType, label: "Discursiva", icon: "✎", color: "text-green-700" },
  { type: "fill" as InsertType, label: "Lacuna", icon: "▁", color: "text-yellow-800" },
  { type: "tf" as InsertType, label: "V/F", icon: "✓", color: "text-pink-700" },
  { type: "match" as InsertType, label: "Associação", icon: "⟷", color: "text-violet-700" },
  { type: "order" as InsertType, label: "Ordenação", icon: "↕", color: "text-orange-700" },
  { type: "table" as InsertType, label: "Tabela", icon: "▦", color: "text-indigo-700" },
];

const FORMAT_ITEMS = [
  { label: "Negrito", shortcut: "**texto**", icon: <b>B</b>, before: "**", after: "**" },
  { label: "Itálico", shortcut: "*texto*", icon: <i>I</i>, before: "*", after: "*" },
  { label: "Sublinhado", shortcut: "__texto__", icon: <u>U</u>, before: "__", after: "__" },
  { label: "Tachado", shortcut: "~~texto~~", icon: <s>S</s>, before: "~~", after: "~~" },
  { label: "Matemática inline", shortcut: "$expressão$", icon: <span className="text-emerald-700">∑</span>, before: "$", after: "$" },
];

function useDropdown() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  return { open, setOpen, ref };
}

export default function EditorToolbar({
  textareaRef,
  onInsert,
  onWrap,
  getNextQuestionNumber,
  onUndo,
  onRedo,
  canUndo,
  canRedo,
  onImageClick,
}: Props) {
  const insertDD = useDropdown();
  const formatDD = useDropdown();

  const handleInsert = useCallback(
    (type: InsertType) => {
      const n = getNextQuestionNumber();
      onInsert(TEMPLATES[type](n));
      textareaRef.current?.focus();
      insertDD.setOpen(false);
    },
    [getNextQuestionNumber, onInsert, textareaRef, insertDD]
  );

  const handleWrap = useCallback(
    (before: string, after: string) => {
      onWrap(before, after);
      textareaRef.current?.focus();
      formatDD.setOpen(false);
    },
    [onWrap, textareaRef, formatDD]
  );

  return (
    <div className="flex flex-wrap gap-1.5 items-center px-2.5 py-1.5 border-b border-border bg-muted/50">
      {/* Inserir dropdown */}
      <div ref={insertDD.ref} className="relative">
        <button
          type="button"
          onClick={() => insertDD.setOpen((o) => !o)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-violet-300 bg-background text-[0.72rem] font-semibold text-violet-700 hover:bg-violet-50 cursor-pointer transition-colors"
        >
          + Inserir
          <ChevronDown
            className={`w-3 h-3 transition-transform ${insertDD.open ? "rotate-180" : ""}`}
          />
        </button>
        {insertDD.open && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[180px]">
            {INSERT_ITEMS.map((item) => (
              <button
                key={item.type}
                type="button"
                onClick={() => handleInsert(item.type)}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[0.78rem] hover:bg-muted transition-colors"
              >
                <span className={`w-4 text-center ${item.color}`}>{item.icon}</span>
                <span className="text-zinc-700">{item.label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Formato dropdown */}
      <div ref={formatDD.ref} className="relative">
        <button
          type="button"
          onClick={() => formatDD.setOpen((o) => !o)}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded border border-zinc-300 bg-background text-[0.72rem] font-semibold text-zinc-600 hover:bg-zinc-50 cursor-pointer transition-colors"
        >
          Formato
          <ChevronDown
            className={`w-3 h-3 transition-transform ${formatDD.open ? "rotate-180" : ""}`}
          />
        </button>
        {formatDD.open && (
          <div className="absolute top-full left-0 mt-1 z-50 bg-white border border-border rounded-lg shadow-lg py-1 min-w-[200px]">
            {FORMAT_ITEMS.map((item, i) => (
              <button
                key={i}
                type="button"
                onClick={() => handleWrap(item.before, item.after)}
                className="w-full text-left px-3 py-1.5 flex items-center gap-2 text-[0.78rem] hover:bg-muted transition-colors"
              >
                <span className="w-5 text-center font-bold text-zinc-500">{item.icon}</span>
                <span className="text-zinc-700 flex-1">{item.label}</span>
                <code className="text-[0.65rem] text-muted-foreground bg-muted px-1 py-0.5 rounded font-mono">
                  {item.shortcut}
                </code>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="w-px h-[18px] bg-border" />

      {/* Undo / Redo */}
      <button
        type="button"
        onClick={() => { onUndo(); textareaRef.current?.focus(); }}
        disabled={!canUndo}
        title="Desfazer (Ctrl+Z)"
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-300 bg-background text-[0.72rem] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        <Undo2 className="w-3.5 h-3.5" />
      </button>
      <button
        type="button"
        onClick={() => { onRedo(); textareaRef.current?.focus(); }}
        disabled={!canRedo}
        title="Refazer (Ctrl+Shift+Z)"
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-300 bg-background text-[0.72rem] font-medium text-zinc-600 hover:bg-zinc-50 disabled:opacity-35 disabled:cursor-not-allowed cursor-pointer transition-colors"
      >
        <Redo2 className="w-3.5 h-3.5" />
      </button>

      <div className="w-px h-[18px] bg-border" />

      {/* Info — single use, keep standalone */}
      <button
        type="button"
        onClick={() => { onInsert(TEMPLATES.instruction(0)); textareaRef.current?.focus(); }}
        title="Inserir instrução (> texto)"
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-red-300 bg-background text-[0.72rem] font-medium text-red-700 hover:bg-red-50 cursor-pointer transition-colors"
      >
        ℹ Info
      </button>

      {/* Separator */}
      <button
        type="button"
        onClick={() => { onInsert(TEMPLATES.separator(0)); textareaRef.current?.focus(); }}
        title="Inserir separador (---)"
        className="inline-flex items-center gap-1 px-2 py-1 rounded border border-zinc-300 bg-background text-[0.72rem] font-medium text-zinc-600 hover:bg-zinc-50 cursor-pointer transition-colors"
      >
        — Sep
      </button>

      {/* Image */}
      {onImageClick && (
        <button
          type="button"
          onClick={onImageClick}
          title="Adicionar imagens"
          className="inline-flex items-center gap-1 px-2 py-1 rounded border border-emerald-300 bg-background text-[0.72rem] font-medium text-emerald-700 hover:bg-emerald-50 cursor-pointer transition-colors"
        >
          <ImageIcon className="w-3.5 h-3.5" />
          Imagem
        </button>
      )}
    </div>
  );
}
