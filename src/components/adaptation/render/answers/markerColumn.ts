/**
 * Coluna do marcador de alternativa (a) / b) / …) nas superfícies de TELA.
 *
 * Paridade com o PDF (achado 0202): `PdfAnswer` declara o marcador como uma
 * coluna de largura FIXA (`ALTERNATIVE_MARKER_COLUMN_PT`), ou seja, todas as
 * alternativas começam no mesmo x. Na tela, `shrink-0` sozinho não fixa nada: a
 * caixa fica do tamanho natural do glifo, então `c)` e `f)` (mais estreitos)
 * puxam o texto para a esquerda e a margem serrilha.
 *
 * A largura vai em `em` para acompanhar o token de fonte da folha, que escala com
 * `pageStyle.fontSize`, e é DERIVADA da coluna do papel menos o vão da linha
 * (`ALTERNATIVE_MARKER_GAP_PX`, aplicado por quem monta a linha) — assim a soma
 * marcador + vão dá exatamente os 22pt do PDF na base de 12pt (achado 0340).
 * O valor literal abaixo é guardado por `answerMarkerColumnParity.test.tsx`,
 * porque a classe do Tailwind precisa ser estática.
 */
export const ALTERNATIVE_MARKER_CLASS = "w-[1.3333em] shrink-0 font-medium";
