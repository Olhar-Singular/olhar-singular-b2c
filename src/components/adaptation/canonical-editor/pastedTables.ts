/**
 * flattenPastedTables — preserva a fronteira das células de uma tabela colada.
 *
 * O schema canônico do editor não registra `table`/`tableRow`/`tableCell`. O
 * parser do ProseMirror então descarta os invólucros e mantém só o texto, que
 * cai todo no MESMO parágrafo: colar uma tabela 1x2 com `A` e `B` gravava o
 * parágrafo `"AB"` (achado 0450). Para lista e blockquote "degradar para
 * parágrafo" preserva o conteúdo, porque cada item já era um bloco; para
 * tabela não, já que a informação que ela carrega são justamente as fronteiras
 * entre células, e elas sumiam sem deixar nem um espaço.
 *
 * Enquanto o colar não sabe construir uma questão `answer.kind = "table"`, o
 * mínimo é não perder conteúdo em silêncio: cada linha vira um parágrafo e as
 * células são separadas por um marcador visível. Quem cola é avisado pelo
 * chamador (`tables > 0`), do mesmo jeito que o export avisa antes do download.
 *
 * HTML sem `<table>` volta intacto — nada de re-serializar um paste normal.
 */

/** Marcador visível entre duas células da mesma linha. */
export const CELL_SEPARATOR = " | ";

export interface FlattenedPaste {
  /** HTML pronto para o parser do ProseMirror. */
  html: string;
  /** Quantas tabelas foram achatadas (0 = HTML devolvido intacto). */
  tables: number;
}

export function flattenPastedTables(html: string): FlattenedPaste {
  const doc = new DOMParser().parseFromString(html, "text/html");
  const tables = Array.from(doc.querySelectorAll("table"));
  if (tables.length === 0) return { html, tables: 0 };

  // Ordem inversa do documento = tabela aninhada antes da que a contém, então
  // a externa já enxerga a interna achatada e não rouba as linhas dela.
  for (const table of tables.reverse()) {
    const wrapper = doc.createElement("div");
    for (const row of Array.from(table.querySelectorAll("tr"))) {
      const cells = Array.from(row.querySelectorAll("th, td"));
      if (cells.length === 0) continue;
      const paragraph = doc.createElement("p");
      paragraph.innerHTML = cells.map((cell) => cell.innerHTML.trim()).join(CELL_SEPARATOR);
      wrapper.appendChild(paragraph);
    }
    table.replaceWith(...(wrapper.childNodes.length > 0 ? [wrapper] : []));
  }

  return { html: doc.body.innerHTML, tables: tables.length };
}
