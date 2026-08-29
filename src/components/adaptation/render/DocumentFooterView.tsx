/**
 * DocumentFooterView — espelho na tela do `PdfPageFooter`.
 *
 * Todo PDF que o app gera imprime um rodapé fixo em TODA página ("Título ·
 * Escola · Página N de M"), inclusive com o cabeçalho vazio, e a prévia do
 * Exportar desenhava o pé da folha em branco (achado 0242): a mesma classe de
 * divergência que o `DocumentHeaderView` resolveu para o cabeçalho (0109).
 *
 * O texto vem de `pdfFooterLabel`, a mesma função que o PDF chama, para as duas
 * superfícies não divergirem como já divergiu o espaçamento do cabeçalho (0117).
 * As medidas do PDF são em pontos; aqui viram px (px = pt * 96/72).
 */

import type { HeaderSettings } from "@/components/adaptation/export/panelSettings";
import { FOOTER_COLOR, FOOTER_FONT_SIZE_PT, pdfFooterLabel } from "./footerLabel";

/** Converte pontos (unidade do PDF) para pixels (unidade da tela). */
const pt2px = (pt: number): number => pt * (96 / 72);

type Props = {
  header: HeaderSettings;
  pageNumber: number;
  totalPages: number;
};

export function DocumentFooterView({ header, pageNumber, totalPages }: Props) {
  return (
    <div
      data-testid={`preview-footer-${pageNumber}`}
      style={{
        textAlign: "center",
        fontSize: `${pt2px(FOOTER_FONT_SIZE_PT)}px`,
        color: FOOTER_COLOR,
      }}
    >
      {pdfFooterLabel(header, pageNumber, totalPages)}
    </div>
  );
}

export default DocumentFooterView;
