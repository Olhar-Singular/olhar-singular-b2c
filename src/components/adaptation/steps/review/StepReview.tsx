import { useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Info, RefreshCw } from "lucide-react";
import { EditorContent, BubbleMenu } from "@tiptap/react";
import { isTextSelection } from "@tiptap/core";
import { useCanonicalEditor } from "@/components/adaptation/canonical-editor/useCanonicalEditor";
import { BlockInserter } from "@/components/adaptation/canonical-editor/block-inserter/BlockInserter";
import { PageBreakMarker } from "@/components/adaptation/canonical-editor/page-break/pageBreakDecoration";
import { OriginalDocExtension } from "@/components/adaptation/canonical-editor/originalDocExtension";
import { PageSheet } from "@/components/adaptation/PageSheet";
import { AppearancePopover } from "./AppearancePopover";
import { MetadataDrawer } from "./MetadataDrawer";
import { SelectionBubble } from "@/components/adaptation/canonical-editor/SelectionBubble";
import { resolvePageStyle } from "@/components/adaptation/render/pageStyle";
import "katex/dist/katex.min.css";
import type { Block, CanonicalDocument, PageStyle } from "@/lib/adaptation/canonical/schema";

/** Metadados pedagógicos da gaveta "Sobre esta adaptação" (§6.7 / Fase 5c). */
export type ReviewMetadata = {
  strategiesApplied: string[];
  implementationTips: string[];
  pedagogicalJustification: string;
};

type Props = {
  document: CanonicalDocument;
  metadata: ReviewMetadata;
  pageStyle?: PageStyle;
  onDocumentChange: (doc: CanonicalDocument) => void;
  onPageStyleChange?: (pageStyle: PageStyle) => void;
  onRegenerate: () => void;
  onNext: () => void;
  onPrev: () => void;
  /**
   * Called when the editor stops (or resumes) being able to convert the sheet
   * to the canonical model — i.e. when edits are no longer reaching the
   * autosave. Forwarded straight to `useCanonicalEditor`; the wizard turns it
   * into a visible warning so a freeze can never look like "Salvo".
   */
  onCaptureFailure?: (reason: string | null) => void;
};

const FALLBACK_TITLE = "Atividade adaptada";

/**
 * Extensions specific to the Revisar surface, beyond the canonical set: the
 * page-break marker (§6.6 / Fase 5b). Module-level constant so the editor is
 * built once (stable reference) instead of rebuilt on every render.
 */
const REVIEW_EXTENSIONS = [PageBreakMarker, OriginalDocExtension];

/** Document title for the chrome bar: plain text of the first heading, or a fallback. */
function documentTitle(doc: CanonicalDocument): string {
  const heading = doc.blocks.find(
    (b): b is Extract<Block, { type: "heading" }> => b.type === "heading",
  );
  if (!heading) return FALLBACK_TITLE;
  const text = heading.content
    .map((n) => (n.type === "text" ? n.text : ""))
    .join("")
    .trim();
  return text || FALLBACK_TITLE;
}

/**
 * StepReview — superfície única de edição "Revisar" (plano §8, Fase 1).
 *
 * Funde os antigos passos Conteúdo + Estilo: o editor canônico montado em modo
 * content, superfície única. A inserção de blocos é o overlay "+" entre
 * blocos (`BlockInserter`, §6.4 / Fase 5a) — não há mais barra de inserir. A barra
 * superior traz o título do documento, Regerar (D13) e Aparência; Sobre esta
 * adaptação / Exportar PDF chegam nas fases seguintes.
 */
export function StepReview({
  document,
  metadata,
  pageStyle,
  onDocumentChange,
  onPageStyleChange,
  onRegenerate,
  onNext,
  onPrev,
  onCaptureFailure,
}: Props) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const surfaceRef = useRef<HTMLDivElement>(null);
  const { editor } = useCanonicalEditor({
    value: document,
    onChange: onDocumentChange,
    extraExtensions: REVIEW_EXTENSIONS,
    onCaptureFailure,
  });

  const handleAppearanceChange = (partial: PageStyle) => {
    onPageStyleChange?.({ ...pageStyle, ...partial });
  };

  /**
   * Alt+F10 (padrão APG) leva o foco do editor para o primeiro controle da barra
   * de seleção. É o único caminho de teclado até ela: Tab a partir do editor
   * colapsa a seleção e fecha o bubble, e cor / tamanho de fonte não têm atalho
   * próprio no Tiptap. `Escape` na barra devolve o foco ao editor.
   */
  const handleSurfaceKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    if (!event.altKey || event.key !== "F10") return;
    const first = surfaceRef.current?.querySelector<HTMLElement>('[role="toolbar"] [tabindex="0"]');
    if (!first) return;
    event.preventDefault();
    first.focus();
  };

  return (
    <div className="space-y-4">
      {/* Barra superior (chrome) — plano §6.1. */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-surface-chrome-line bg-surface-chrome px-4 py-2.5">
        <h2 className="min-w-0 flex-1 truncate text-base font-semibold text-surface-ink">
          {documentTitle(document)}
        </h2>
        {/* Em telas estreitas os botões viram só ícone (rótulo a partir de `sm`),
            senão o grupo `shrink-0` transborda a viewport e é clipado. */}
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onRegenerate}
            aria-label="Regerar"
            title="Regerar"
            className="shrink-0 px-2 text-surface-ink-soft hover:text-surface-ink sm:px-3"
          >
            <RefreshCw className="w-4 h-4" />
            <span className="hidden sm:ml-1 sm:inline">Regerar</span>
          </Button>
          <AppearancePopover value={resolvePageStyle(pageStyle)} onChange={handleAppearanceChange} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAboutOpen(true)}
            aria-label="Sobre esta adaptação"
            title="Sobre esta adaptação"
            className="shrink-0 px-2 text-surface-ink-soft hover:text-surface-ink sm:px-3"
          >
            <Info className="w-4 h-4" />
            <span className="hidden sm:ml-1 sm:inline">Sobre esta adaptação</span>
          </Button>
        </div>
      </div>

      <MetadataDrawer
        open={aboutOpen}
        onOpenChange={setAboutOpen}
        strategies={metadata.strategiesApplied}
        tips={metadata.implementationTips}
        justification={metadata.pedagogicalJustification}
      />

      {editor && (
        <div ref={surfaceRef} onKeyDown={handleSurfaceKeyDown}>
          {/* Bubble de seleção (plano §6.2): aparece só com seleção não-vazia no
              editor principal — editores aninhados (RichTextField) são instâncias
              separadas, então o bubble não os atinge.
              `appendTo: "parent"` mantém o popover adjacente à referência na ordem
              do DOM (caça 0208); sem isso o tippy o joga no fim do <body> e a barra
              fica a ~15 elementos focáveis do editor. */}
          <BubbleMenu
            editor={editor}
            tippyOptions={{ duration: 100, appendTo: "parent" }}
            shouldShow={({ state }) => isTextSelection(state.selection) && !state.selection.empty}
          >
            <SelectionBubble editor={editor} />
          </BubbleMenu>
          <PageSheet pageStyle={pageStyle}>
            {/* `relative` ancora o overlay "+" (§6.4) sobre o conteúdo do editor. */}
            <div className="relative">
              <EditorContent editor={editor} />
              <BlockInserter editor={editor} />
            </div>
          </PageSheet>
        </div>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrev} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button onClick={onNext} aria-label="Avançar para exportação">
          Exportar <ArrowRight className="w-4 h-4 ml-2" />
        </Button>
      </div>
    </div>
  );
}

export default StepReview;
