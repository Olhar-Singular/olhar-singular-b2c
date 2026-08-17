import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ArrowLeft, RotateCcw, Save, Loader2 } from "lucide-react";
import { CanonicalRenderer } from "@/components/adaptation/render/CanonicalRenderer";
import { DocumentHeaderView } from "@/components/adaptation/render/DocumentHeaderView";
import { ExportPanel } from "@/components/adaptation/export/ExportPanel";
import { PageSheet } from "@/components/adaptation/PageSheet";
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
  onPrev: () => void;
  onRestart: () => void;
};

export function StepExportCanonical({
  result,
  canSave,
  saving,
  onSave,
  onHeaderChange,
  onPrev,
  onRestart,
}: Props) {
  const document = result.document;
  /*
    Espelho do switch do ExportPanel: a escolha é só de exportação (não entra no
    documento salvo), mas a prévia precisa dela para desenhar onde a página vira.
    Sem isso o switch mudava o PDF e a folha aqui não mexia um pixel (achado 0110).
  */
  const [pageBreakPerQuestion, setPageBreakPerQuestion] = useState(false);

  return (
    <div className="space-y-6">
      <h2 className="text-lg font-semibold text-foreground">Exportar</h2>

      <ExportPanel
        document={document}
        header={result.header}
        onHeaderChange={onHeaderChange}
        pageStyle={result.pageStyle}
        onPageBreakPerQuestionChange={setPageBreakPerQuestion}
      />

      <div className="flex flex-wrap gap-2">
        <Button variant="outline" onClick={onSave} disabled={!canSave || saving}>
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
      <PageSheet pageStyle={result.pageStyle} paginated>
        {/*
          O cabeçalho preenchido acima sai no PDF e no Word; a prévia não o
          mostrava, então o professor só via o bloco (e o título repetido com o
          H1 do documento) depois do download. Mesmo bloco do `PdfHeader`.
        */}
        <DocumentHeaderView header={result.header ?? {}} />
        <CanonicalRenderer document={document} pageBreakPerQuestion={pageBreakPerQuestion} />
      </PageSheet>

      <div className="flex justify-between">
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
