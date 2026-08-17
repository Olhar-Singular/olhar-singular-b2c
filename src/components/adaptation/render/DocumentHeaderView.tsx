/**
 * DocumentHeaderView — espelho na tela do `PdfHeader`.
 *
 * O cabeçalho (Título/Escola/Professor(a)/Data) do passo Exportar era desenhado
 * só no PDF e no Word: o professor preenchia os campos, a folha da prévia não
 * mudava nada e ele só descobria o bloco (e o título duplicado com o H1 do
 * documento) dentro do arquivo baixado. Este componente põe o mesmo bloco na
 * prévia, com a mesma régua e o mesmo deslocamento do corpo.
 *
 * As medidas do PDF são em pontos; aqui são convertidas para px (px = pt * 96/72)
 * para manter a paridade com `PdfHeader`. Mexeu em um, mexa no outro.
 */

import type { HeaderSettings } from "@/components/adaptation/export/panelSettings";
import { formatHeaderDateBR, hasHeaderContent } from "@/components/adaptation/export/panelSettings";

/** Converte pontos (unidade do PDF) para pixels (unidade da tela). */
const pt2px = (pt: number): number => pt * (96 / 72);

const filled = (value?: string): boolean => value !== undefined && value.trim() !== "";

export function DocumentHeaderView({ header }: { header: HeaderSettings }) {
  if (!hasHeaderContent(header)) return null;

  return (
    <div
      data-testid="preview-header"
      style={{
        marginBottom: pt2px(16),
        paddingBottom: pt2px(8),
        borderBottom: "1px solid #333333",
      }}
    >
      {filled(header.title) && (
        <div style={{ fontSize: pt2px(18), fontWeight: "bold", textAlign: "center" }}>
          {header.title}
        </div>
      )}
      {filled(header.school) && (
        <div style={{ fontSize: pt2px(11), textAlign: "center" }}>{header.school}</div>
      )}
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginTop: pt2px(6),
          fontSize: pt2px(10),
        }}
      >
        <span>{filled(header.teacher) ? `Professor(a): ${header.teacher}` : " "}</span>
        <span>{filled(header.date) ? `Data: ${formatHeaderDateBR(header.date!)}` : " "}</span>
      </div>
    </div>
  );
}

export default DocumentHeaderView;
