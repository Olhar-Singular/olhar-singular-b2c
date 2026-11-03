/**
 * CheckboxBox — a caixa vazia que o aluno marca com X, nas superfícies de TELA
 * (folha do Revisar e prévia do Exportar).
 *
 * Uma implementação só, lendo `CHECKBOX_BOX_*` de `pageTokens`, porque as duas
 * telas escreviam a sua: 17px de lado com borda de 1,5px na folha do Revisar e
 * 16px com borda de 1px na prévia, em tokens de cor do chrome do app (achado
 * 0358). O `Canvas` do `PdfAnswer` desenha esta mesma caixa no papel.
 *
 * As medidas vão em `style` (e não em classe do Tailwind) pelo mesmo motivo de
 * `OpenAnswerView`: a classe do Tailwind precisa ser estática e o token deixaria
 * de ser o ponto único.
 */

import {
  CHECKBOX_BOX_PX,
  CHECKBOX_BOX_BORDER_PX,
  CHECKBOX_BOX_RADIUS_PX,
  CHECKBOX_BOX_COLOR,
} from "./pageTokens";

export function CheckboxBox({ testId = "checkbox-box" }: { testId?: string }) {
  return (
    <span
      data-testid={testId}
      data-shape="square"
      aria-label="Caixa de seleção"
      className="mt-1 shrink-0 border-solid"
      style={{
        width: `${CHECKBOX_BOX_PX}px`,
        height: `${CHECKBOX_BOX_PX}px`,
        borderWidth: `${CHECKBOX_BOX_BORDER_PX}px`,
        borderColor: CHECKBOX_BOX_COLOR,
        borderRadius: `${CHECKBOX_BOX_RADIUS_PX}px`,
      }}
    />
  );
}

export default CheckboxBox;
