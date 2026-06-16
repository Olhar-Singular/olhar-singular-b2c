import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, Info, RefreshCw } from "lucide-react";
import { EditorContent, BubbleMenu } from "@tiptap/react";
import { useCanonicalEditor } from "@/components/adaptation/canonical-editor/useCanonicalEditor";
import { BlockInserter } from "@/components/adaptation/canonical-editor/block-inserter/BlockInserter";
import { PageBreakMarker } from "@/components/adaptation/canonical-editor/page-break/pageBreakDecoration";
import { PageSheet } from "@/components/adaptation/PageSheet";
import { AppearancePopover } from "./AppearancePopover";
import { MetadataDrawer } from "./MetadataDrawer";
import { SelectionBubble } from "./SelectionBubble";
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
};

const FALLBACK_TITLE = "Atividade adaptada";

/**
 * Extensions specific to the Revisar surface, beyond the canonical set: the
 * page-break marker (§6.6 / Fase 5b). Module-level constant so the editor is
 * built once (stable reference) instead of rebuilt on every render.
 */
const REVIEW_EXTENSIONS = [PageBreakMarker];

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
}: Props) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const { editor } = useCanonicalEditor({
    value: document,
    onChange: onDocumentChange,
    extraExtensions: REVIEW_EXTENSIONS,
  });

  const handleAppearanceChange = (partial: PageStyle) => {
    onPageStyleChange?.({ ...pageStyle, ...partial });
  };

  return (
    <div className="space-y-4">
      {/* Barra superior (chrome) — plano §6.1. */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-surface-chrome-line bg-surface-chrome px-4 py-2.5">
        <h2 className="truncate text-base font-semibold text-surface-ink">{documentTitle(document)}</h2>
        <div className="flex shrink-0 items-center gap-1">
          <Button
            size="sm"
            variant="ghost"
            onClick={onRegenerate}
            className="shrink-0 text-surface-ink-soft hover:text-surface-ink"
          >
            <RefreshCw className="w-4 h-4 mr-1" /> Regerar
          </Button>
          <AppearancePopover value={resolvePageStyle(pageStyle)} onChange={handleAppearanceChange} />
          <Button
            size="sm"
            variant="ghost"
            onClick={() => setAboutOpen(true)}
            className="shrink-0 text-surface-ink-soft hover:text-surface-ink"
          >
            <Info className="w-4 h-4 mr-1" /> Sobre esta adaptação
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
        <>
          {/* Bubble de seleção (plano §6.2): aparece só com seleção não-vazia no
              editor principal — editores aninhados (RichTextField) são instâncias
              separadas, então o bubble não os atinge. */}
          <BubbleMenu editor={editor}>
            <SelectionBubble editor={editor} />
          </BubbleMenu>
          <PageSheet pageStyle={pageStyle}>
            {/* `relative` ancora o overlay "+" (§6.4) sobre o conteúdo do editor. */}
            <div className="relative">
              <EditorContent editor={editor} className="text-base" />
              <BlockInserter editor={editor} />
            </div>
          </PageSheet>
        </>
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
