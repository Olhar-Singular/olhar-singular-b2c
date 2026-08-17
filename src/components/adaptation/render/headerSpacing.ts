/**
 * Espaçamentos do cabeçalho do documento (Título/Escola/Professor(a)/Data),
 * em **pontos** — a unidade do PDF. Fonte única para as duas superfícies que
 * desenham esse bloco: `PdfHeader` (react-pdf, em pt) e `DocumentHeaderView`
 * (prévia do Exportar, que converte para px).
 *
 * Existe porque o par título -> escola não tinha espaçamento nenhum: a distância
 * nascia só da entrelinha, e as duas engines distribuem entrelinha de formas
 * diferentes (na prévia sobravam ~4 mm, no PDF ~0,8 mm). Espaçamento explícito
 * na mesma constante é o que mantém a paridade sem depender de entrelinha.
 */
export const HEADER_SPACING_PT = {
  /** Respiro entre o título e o nome da escola. */
  schoolTop: 6,
  /** Respiro entre a escola (ou o título) e a linha Professor(a)/Data. */
  metaTop: 6,
  /** Espaço entre a linha Professor(a)/Data e a régua do cabeçalho. */
  bottomPadding: 8,
  /** Espaço entre a régua e o começo do corpo do documento. */
  bottomMargin: 16,
} as const;
