/**
 * PageBreakMark — a régua tracejada "QUEBRA DE PÁGINA" desenhada na folha.
 *
 * Mesmo desenho do marcador do editor do Revisar
 * (`canonical-editor/page-break/pageBreakDecoration.ts`), sem o controle de
 * remover: aqui a quebra não é um campo do bloco, é consequência do switch
 * "Quebra de página por questão" do Exportar. É chrome, não conteúdo — nunca
 * entra no documento canônico e não vai para o PDF (lá a quebra é real).
 */

/** Rótulo em caixa alta do marcador, usado na prévia e no editor. */
export const PAGE_BREAK_LABEL = "QUEBRA DE PÁGINA";

export function PageBreakMark() {
  return (
    <div
      data-testid="preview-page-break"
      className="adaptar-page-break my-3 flex select-none items-center gap-2"
    >
      <span className="h-px flex-1 border-t border-dashed border-surface-line-2" />
      <span className="text-[10px] font-medium uppercase tracking-wider text-surface-ink-faint">
        {PAGE_BREAK_LABEL}
      </span>
      <span className="h-px flex-1 border-t border-dashed border-surface-line-2" />
    </div>
  );
}

export default PageBreakMark;
