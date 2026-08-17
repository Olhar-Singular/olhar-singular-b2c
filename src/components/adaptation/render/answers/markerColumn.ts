/**
 * Coluna do marcador de alternativa (a) / b) / …) nas superfícies de TELA.
 *
 * Paridade com o PDF (achado 0202): `PdfAnswer` declara o marcador como
 * `{ width: 22, flexShrink: 0 }`, ou seja, uma coluna de largura FIXA — todas as
 * alternativas começam no mesmo x. Na tela, `shrink-0` sozinho não fixa nada: a
 * caixa fica do tamanho natural do glifo, então `c)` e `f)` (mais estreitos) puxam
 * o texto para a esquerda e a margem serrilha. A largura vai em `em` para
 * acompanhar o token de fonte da folha, que escala com `pageStyle.fontSize`
 * (22pt sobre a base de 12pt ≈ 1.8em, dos quais ~0.45em ficam no `gap` da linha).
 */
export const ALTERNATIVE_MARKER_CLASS = "w-[1.35em] shrink-0 font-medium";
