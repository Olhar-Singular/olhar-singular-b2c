import { useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, ArrowRight, FileText, Info, RefreshCw, Save } from "lucide-react";
import { EditorContent, BubbleMenu } from "@tiptap/react";
import { isTextSelection } from "@tiptap/core";
import { useCanonicalEditor } from "@/components/adaptation/canonical-editor/useCanonicalEditor";
import { BlockInserter } from "@/components/adaptation/canonical-editor/block-inserter/BlockInserter";
import { PageBreakMarker } from "@/components/adaptation/canonical-editor/page-break/pageBreakDecoration";
import { OriginalDocExtension } from "@/components/adaptation/canonical-editor/originalDocExtension";
import { UploadedExamExtension } from "@/components/adaptation/canonical-editor/uploadedExamExtension";
import { PageSheet } from "@/components/adaptation/PageSheet";
import { AppearancePopover } from "./AppearancePopover";
import { MetadataDrawer } from "./MetadataDrawer";
import { OriginalExamDialog } from "./OriginalExamDialog";
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
  /**
   * The adaptation's name, edited right on the sheet's chrome bar. Empty means
   * "not named yet": the derived document heading shows as a placeholder but is
   * never stored, so an untitled adaptation still falls back to the
   * server-derived title instead of freezing a guess.
   */
  title?: string;
  onTitleChange?: (title: string) => void;
  /** Whether there is a persisted draft row to mark as saved. */
  canSave?: boolean;
  /** A save is in flight. */
  saving?: boolean;
  onSave?: () => void;
  /**
   * Only set for adaptações do "Adaptar direto do arquivo" — the raw file and
   * its rasterized pages, so the teacher can open "Ver prova original" to
   * compare, and ImageNodeView can offer "Recortar do original". Absent for
   * adaptações montadas pelo Banco de Questões (no source file to compare).
   */
  originalExam?: { file: File; pageImages: string[]; userId: string | null } | null;
};

const FALLBACK_TITLE = "Atividade adaptada";

/**
 * Extensions specific to the Revisar surface, beyond the canonical set: the
 * page-break marker (§6.6 / Fase 5b) and the original-question snapshot
 * (§Reset). Stable across renders — UploadedExamExtension (which DOES vary
 * per adaptation) is added separately, memoized on `originalExam`.
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
  title = "",
  onTitleChange,
  canSave = false,
  saving = false,
  onSave,
  originalExam = null,
}: Props) {
  const [aboutOpen, setAboutOpen] = useState(false);
  const [originalOpen, setOriginalOpen] = useState(false);

  // useEditor (inside useCanonicalEditor) only reads extensions once, at
  // mount — this only needs to be stable across a single Revisar session,
  // which it is: originalExam is set once at upload and never changes after.
  const extensions = useMemo(
    () => [
      ...REVIEW_EXTENSIONS,
      UploadedExamExtension.configure({
        file: originalExam?.file ?? null,
        pageImages: originalExam?.pageImages ?? [],
        userId: originalExam?.userId ?? null,
      }),
    ],
    [originalExam],
  );

  const { editor } = useCanonicalEditor({
    value: document,
    onChange: onDocumentChange,
    extraExtensions: extensions,
    onCaptureFailure,
  });

  const handleAppearanceChange = (partial: PageStyle) => {
    onPageStyleChange?.({ ...pageStyle, ...partial });
  };

  return (
    <div className="space-y-4">
      {/* Barra superior (chrome) — plano §6.1. */}
      <div className="flex items-center justify-between gap-3 rounded-md border border-surface-chrome-line bg-surface-chrome px-4 py-2.5">
        <input
          type="text"
          aria-label="Nome da adaptação"
          value={title}
          onChange={(e) => onTitleChange?.(e.target.value)}
          placeholder={documentTitle(document)}
          maxLength={120}
          className="min-w-0 flex-1 truncate border-0 bg-transparent p-0 text-base font-semibold text-surface-ink outline-none placeholder:font-semibold placeholder:text-surface-ink-faint focus:ring-0"
        />
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
          {originalExam && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setOriginalOpen(true)}
              className="shrink-0 text-surface-ink-soft hover:text-surface-ink"
            >
              <FileText className="w-4 h-4 mr-1" /> Ver prova original
            </Button>
          )}
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

      {originalExam && (
        <OriginalExamDialog
          open={originalOpen}
          onOpenChange={setOriginalOpen}
          pageImages={originalExam.pageImages}
        />
      )}

      {editor && (
        <>
          {/* Bubble de seleção (plano §6.2): aparece só com seleção não-vazia no
              editor principal — editores aninhados (RichTextField) são instâncias
              separadas, então o bubble não os atinge. */}
          <BubbleMenu
            editor={editor}
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
        </>
      )}

      <div className="flex justify-between pt-4">
        <Button variant="outline" onClick={onPrev} aria-label="Voltar">
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <div className="flex items-center gap-2">
          {/* Filing the adaptation used to be possible only on the Exportar
              step, so anyone who finished editing and left never filed it. */}
          <Button
            variant="outline"
            onClick={() => onSave?.()}
            disabled={!canSave || saving}
            aria-label="Salvar adaptação"
          >
            <Save className="w-4 h-4 mr-2" /> {saving ? "Salvando…" : "Salvar adaptação"}
          </Button>
          <Button onClick={onNext} aria-label="Avançar para exportação">
            Exportar <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}

export default StepReview;
