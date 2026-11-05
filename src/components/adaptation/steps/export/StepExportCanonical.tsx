import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Save, Loader2 } from "lucide-react";
import { CanonicalRenderer } from "@/components/adaptation/render/CanonicalRenderer";
import { DocumentHeaderView } from "@/components/adaptation/render/DocumentHeaderView";
import { DocumentFooterView } from "@/components/adaptation/render/DocumentFooterView";
import { ExportPanel } from "@/components/adaptation/export/ExportPanel";
import { PageSheet } from "@/components/adaptation/PageSheet";
import { mathPreviewNotice } from "@/components/adaptation/export/exportWarnings";
import type { AdaptationResult, DocumentHeader } from "@/lib/adaptation/canonical/schema";

type Props = {
  result: AdaptationResult;
  /** Whether a draft row exists to mark ready. */
  canSave: boolean;
  /** True while the markReady mutation is in flight. */
  saving: boolean;
  onSave: () => void;
  /** Persist a change to the document header (title/school/teacher/date). */
  onHeaderChange?: (header: DocumentHeader) => void;
  /**
   * Switch "Quebra de página por questão", controlado pelo wizard: o passo
   * desmonta a cada troca de passo e o estado local voltava a desligado
   * (achado 0517). Não entra no documento salvo.
   */
  pageBreakPerQuestion: boolean;
  onPageBreakPerQuestionChange: (value: boolean) => void;
  onPrev: () => void;
  onRestart: () => void;
};

export function StepExportCanonical({
  result,
  canSave,
  saving,
  onSave,
  onHeaderChange,
  pageBreakPerQuestion,
  onPageBreakPerQuestionChange,
  onPrev,
  onRestart,
}: Props) {
  const document = result.document;
  const mathNotice = mathPreviewNotice(document);
  /*
    A escolha da quebra é só de exportação (não entra no documento salvo), mas a
    prévia precisa dela para desenhar onde a página vira (achado 0110). Uma só
    fonte de verdade, no wizard, para o painel e a prévia (achado 0517).
  */

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Exportar</h2>

      <ExportPanel
        document={document}
        header={result.header}
        onHeaderChange={onHeaderChange}
        pageStyle={result.pageStyle}
        pageBreakPerQuestion={pageBreakPerQuestion}
        onPageBreakPerQuestionChange={onPageBreakPerQuestionChange}
      />

      <div className="flex flex-wrap gap-2">
        {/* Achado 0511: `disabled` nativo durante o salvamento largava o foco
            no `<body>`; em curso, só `aria-disabled` + guarda no clique. */}
        <Button
          variant="outline"
          onClick={() => {
            if (!saving) onSave();
          }}
          disabled={!canSave}
          aria-disabled={saving || undefined}
          className="aria-disabled:opacity-50"
        >
          {saving ? (
            <Loader2 className="w-4 h-4 mr-1 animate-spin" />
          ) : (
            <Save className="w-4 h-4 mr-1" />
          )}
          Salvar
        </Button>
      </div>

      {/*
        The preview is the LAST look the teacher gets before downloading, so it
        renders through the same page tokens as the Revisar sheet and the PDF
        (`PageSheet` + `pageStyle`). Rendering it in the app's default typography
        showed a different document from the one that would come out of the
        printer — exactly on the screen meant for checking it.
      */}
      {/*
        `paginated`: aqui a folha ganha a altura do A4, a régua de virada de
        página e a contagem de folhas. A prévia era contínua e de altura livre
        enquanto o arquivo saía com N páginas, então o professor só descobria
        quantas folhas ia imprimir (e quanto sobrava na última) depois do
        download (achado 0118).
      */}
      {/*
        `footer`: o PDF imprime "Título · Escola · Página N de M" em TODA página
        (mesmo com o cabeçalho vazio) e a prévia deixava o pé da folha em branco
        (achado 0242) — a mesma divergência que o `DocumentHeaderView` já tinha
        fechado no topo. Mesmo texto, pela mesma `pdfFooterLabel`.
      */}
      {mathNotice && (
        <div
          role="status"
          aria-label="As fórmulas saem diferentes no arquivo"
          className="rounded-md border border-border bg-muted/50 px-3 py-2 text-sm text-foreground"
        >
          <p className="font-medium">As fórmulas saem diferentes no arquivo</p>
          <p>{mathNotice.text}</p>
          <p>
            Por exemplo, a primeira fórmula do seu documento sai escrita assim:{" "}
            <code className="rounded bg-background px-1 py-0.5 font-mono">{mathNotice.example}</code>
          </p>
          {mathNotice.altText && <p>{mathNotice.altText}</p>}
        </div>
      )}

      <PageSheet
        pageStyle={result.pageStyle}
        paginated
        footer={(pageNumber, totalPages) => (
          <DocumentFooterView
            header={result.header ?? {}}
            pageNumber={pageNumber}
            totalPages={totalPages}
          />
        )}
      >
        {/*
          O cabeçalho preenchido acima sai no PDF e no Word; a prévia não o
          mostrava, então o professor só via o bloco (e o título repetido com o
          H1 do documento) depois do download. Mesmo bloco do `PdfHeader`.
        */}
        <DocumentHeaderView header={result.header ?? {}} />
        <CanonicalRenderer document={document} pageBreakPerQuestion={pageBreakPerQuestion} />
      </PageSheet>

      {/* Mesma barra, mesmo achado 0156: num documento de 2.944px os CTAs do
          passo só apareciam depois de rolar a prévia inteira.
          Achado 0504: esta barra fica FORA do `PageSheet` — é chrome do app,
          não folha. Com os tokens `--sf-*` (que não têm override no `.dark`,
          por desenho: o papel é branco nos dois temas) ela virava uma faixa
          creme acesa no rodapé de uma página escura. Tokens do app, então. */}
      <div className="sticky bottom-0 z-10 flex justify-between gap-2 border-t border-border bg-card px-2 py-3">
        <Button variant="outline" onClick={onPrev}>
          <ArrowLeft className="w-4 h-4 mr-2" /> Voltar
        </Button>
        <Button variant="outline" onClick={onRestart}>
          <RotateCcw className="w-4 h-4 mr-1" /> Nova adaptação
        </Button>
      </div>
    </div>
  );
}

export default StepExportCanonical;
