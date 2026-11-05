/**
 * A largura REAL da coluna que hospeda um texto, para a fórmula saber se cabe (N-M-001).
 *
 * O teto de caracteres de `mathToPdfText` mede a folha inteira, mas a fórmula também sai
 * dentro do recuo do número da questão, da coluna do pareamento, da célula da tabela, ao lado
 * do marcador da alternativa. Nessas colunas o átomo "que cabe na folha" passava da caixa e o
 * papel o cortava (ou o punha por cima da coluna vizinha). Cada contêiner estreito calcula
 * quanto sobra (`shareColumnPt`) e passa o número, como prop, a quem imprime fórmula
 * (`PdfRichText`, `PdfMath`).
 *
 * É uma ESTIMATIVA e erra para o lado seguro: nunca maior que a caixa que o Yoga entrega
 * (`mathColumnFit.test.tsx` mede as duas no layout real). Sem número vale a folha.
 */
import { PDF_CONTENT_WIDTH_PT } from "./mathToPdfText";

/** Como um contêiner reduz a coluna que recebe. */
export interface ColumnShare {
  /** Tirado da coluna inteira antes de dividir (recuo, marcador, elo). */
  minus?: number;
  /** Em quantas colunas iguais a largura se divide (pareamento, tabela). */
  parts?: number;
  /** Tirado de cada parte depois de dividir (recuo e borda da célula). */
  partMinus?: number;
}

/** A largura que sobra: `(atual - minus) / parts - partMinus`, nunca menor que 1 pt. `atual` ausente = a folha. */
export function shareColumnPt(current: number | undefined, share: ColumnShare): number {
  const whole = current ?? PDF_CONTENT_WIDTH_PT;
  return Math.max(1, (whole - (share.minus ?? 0)) / (share.parts ?? 1) - (share.partMinus ?? 0));
}
