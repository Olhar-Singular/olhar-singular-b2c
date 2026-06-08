/**
 * StylingSurface — the Estilo step as a click-to-edit surface.
 *
 * The big editable preview IS the canonical editor, rendered in STYLE mode
 * (`EditorModeProvider value="style"`) so the toolbar/quick formats apply but
 * the question structure actions are hidden. There is NO block dropdown: the
 * "current" block is simply the top-level block holding the editor selection
 * (clicking a block places the cursor → it becomes current), highlighted by the
 * `CurrentBlockHighlight` decoration. A floating "Estilo" handle anchored to that
 * block opens a popover with its `NodeStyle` controls plus whole-block
 * bold/italic/color toggles.
 *
 * All document mutations go through tested pure helpers — `setBlockStyle`,
 * `applyMarkToBlock`, `applyColorToBlock`, `findBlockStyle`, `currentTopLevelBlock`.
 * The popover-anchor geometry (`blockAnchorRect`) is the only browser-coupled
 * glue and is read defensively (guarded position reads; never throws).
 */

import { useCallback, useLayoutEffect, useMemo, useRef, useState } from "react";
import { EditorContent, type Editor } from "@tiptap/react";
import { Anchor as PopoverAnchor } from "@radix-ui/react-popover";
import { Popover, PopoverContent } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { Paintbrush } from "lucide-react";
import { useCanonicalEditor } from "@/components/adaptation/canonical-editor/useCanonicalEditor";
import { CanonicalToolbar } from "@/components/adaptation/canonical-editor/CanonicalToolbar";
import { EditorModeProvider } from "@/components/adaptation/canonical-editor/EditorMode";
import { setBlockStyle } from "@/lib/adaptation/canonical/style";
import type { CanonicalDocument, NodeStyle } from "@/lib/adaptation/canonical/schema";
import "katex/dist/katex.min.css";
import { currentTopLevelBlock, type CurrentBlock } from "./currentBlock";
import { CurrentBlockHighlight } from "./styleDecoration";
import { applyMarkToBlock, applyColorToBlock, type BlockToggleMark } from "./blockMarks";
import { findBlockStyle } from "./findBlockStyle";
import { blockAnchorRect, type AnchorRect } from "./anchorRect";
import { StyleControls } from "./StyleControls";
import { SelectionBubbleMenu } from "./SelectionBubbleMenu";
import { DocumentStyleControl } from "./DocumentStyleControl";
import { applyStyleToAllBlocks } from "@/lib/adaptation/canonical/applyStyleToAll";

type Props = {
  document: CanonicalDocument;
  onChange: (doc: CanonicalDocument) => void;
};

export function StylingSurface({ document, onChange }: Props) {
  const [current, setCurrent] = useState<CurrentBlock | null>(null);
  const [rect, setRect] = useState<AnchorRect | null>(null);
  const [open, setOpen] = useState(false);
  const editorRef = useRef<Editor | null>(null);
  const containerRef = useRef<HTMLDivElement | null>(null);

  const handleSelection = useCallback((editor: Editor) => {
    editorRef.current = editor;
    setCurrent(currentTopLevelBlock(editor.state));
  }, []);

  const { editor } = useCanonicalEditor({
    value: document,
    onChange,
    extraExtensions: [CurrentBlockHighlight],
    onSelectionUpdate: handleSelection,
  });
  if (editor) editorRef.current = editor;

  // Recompute the floating handle's position whenever the current block changes.
  useLayoutEffect(() => {
    setRect(blockAnchorRect(editorRef.current, current?.pos, containerRef.current));
    // Closing the popover when the block changes keeps it from pointing at a
    // stale anchor.
    setOpen(false);
  }, [current]);

  const style: NodeStyle = useMemo(
    () => (current ? findBlockStyle(document, current.id) : {}),
    [current, document],
  );

  const patch = useCallback(
    (partial: Partial<NodeStyle>) => {
      /* v8 ignore next -- defensive: the controls only render with a current block */
      if (!current) return;
      const next: NodeStyle = { ...style, ...partial };
      for (const key of Object.keys(next) as (keyof NodeStyle)[]) {
        if (next[key] === undefined) delete next[key];
      }
      onChange(setBlockStyle(document, current.id, next));
    },
    [current, style, document, onChange],
  );

  const toggleMark = useCallback(
    (mark: BlockToggleMark) => {
      const ed = editorRef.current;
      /* v8 ignore next -- defensive: the controls only render with a ready editor + current block */
      if (!ed || !current) return;
      const tr = applyMarkToBlock(ed.state, current.id, mark);
      if (tr) ed.view.dispatch(tr);
    },
    [current],
  );

  const colorBlock = useCallback(
    (color: string | null) => {
      const ed = editorRef.current;
      /* v8 ignore next -- defensive: the controls only render with a ready editor + current block */
      if (!ed || !current) return;
      const tr = applyColorToBlock(ed.state, current.id, color);
      if (tr) ed.view.dispatch(tr);
    },
    [current],
  );

  const applyToAll = useCallback(
    (style: NodeStyle) => onChange(applyStyleToAllBlocks(document, style)),
    [document, onChange],
  );

  if (!editor) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between gap-2">
        <p className="text-sm text-muted-foreground">
          Clique em um bloco para selecioná-lo; use a paleta ao lado dele para ajustar a aparência.
          Selecione um trecho de texto para formatá-lo.
        </p>
        <DocumentStyleControl onApplyToAll={applyToAll} />
      </div>

      <div className="rounded-md border border-input bg-background">
        <CanonicalToolbar editor={editor} />

        <div ref={containerRef} className="relative">
          <EditorModeProvider value="style">
            <EditorContent editor={editor} className="px-4 py-3 text-base" />
            <SelectionBubbleMenu editor={editor} />
          </EditorModeProvider>

          <Popover open={open} onOpenChange={setOpen}>
            {/* The anchor floats over the current block; the handle button is
                positioned at its top-right corner. */}
            <PopoverAnchor asChild>
              <div
                aria-hidden
                className="pointer-events-none absolute"
                style={
                  rect
                    ? { top: rect.top, left: rect.left, width: rect.width, height: rect.height }
                    : { top: 0, left: 0 }
                }
              />
            </PopoverAnchor>

            {current && rect && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                aria-label="Abrir estilo do bloco"
                data-testid="open-style-popover"
                className="absolute z-10 h-7 gap-1 px-2 text-xs shadow-sm"
                style={{ top: rect.top + 4, left: rect.left + rect.width - 88 }}
                onClick={() => setOpen((v) => !v)}
              >
                <Paintbrush className="h-3.5 w-3.5" />
                Estilo
              </Button>
            )}

            <PopoverContent align="end" side="top" className="w-80">
              {current && (
                <StyleControls
                  style={style}
                  onPatch={patch}
                  onToggleMark={toggleMark}
                  onColorBlock={colorBlock}
                />
              )}
            </PopoverContent>
          </Popover>
        </div>
      </div>
    </div>
  );
}

export default StylingSurface;
