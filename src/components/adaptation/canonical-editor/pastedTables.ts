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

const BLOCK_TAGS = new Set([
  "address", "article", "aside", "blockquote", "div", "dd", "dl", "dt", "figcaption",
  "figure", "footer", "h1", "h2", "h3", "h4", "h5", "h6", "header", "li", "main", "nav",
  "ol", "p", "pre", "section", "table", "tbody", "td", "tfoot", "th", "thead", "tr", "ul",
]);

const TEXT_NODE = 3;
const ELEMENT_NODE = 1;

/**
 * Conteúdo inline de uma célula, com os blocos desembrulhados.
 *
 * O Word embrulha o texto de cada `<td>` num `<p class=MsoNormal>`. Concatenar
 * o `innerHTML` das células num `<p>` aninhava esse bloco dentro do parágrafo
 * da linha; o reparse em contexto de `body` fechava o `<p>` externo na abertura
 * do interno e devolvia uma célula por parágrafo (achado 0451). Montando por
 * nós, nenhum bloco sobra dentro do parágrafo da linha.
 *
 * Tag de namespace do Office (`<o:p>`, `<w:…>`) também é desembrulhada: ela não
 * carrega conteúdo próprio e sobreviveria até a folha como bloco fantasma.
 *
 * Texto só de espaço é descartado: é a indentação do HTML do Word entre os
 * blocos, não conteúdo. Blocos irmãos ficam separados por um espaço.
 */
function isUnwrappable(element: Element): boolean {
  const tag = element.tagName.toLowerCase();
  return BLOCK_TAGS.has(tag) || tag.includes(":");
}

function inlineNodesOf(element: Element, doc: Document): Node[] {
  const out: Node[] = [];
  for (const child of Array.from(element.childNodes)) {
    if (child.nodeType === ELEMENT_NODE && isUnwrappable(child as Element)) {
      const inner = inlineNodesOf(child as Element, doc);
      if (inner.length === 0) continue;
      if (out.length > 0) out.push(doc.createTextNode(" "));
      out.push(...inner);
      continue;
    }
    if (child.nodeType === TEXT_NODE && String(child.textContent).trim() === "") continue;
    out.push(child.cloneNode(true));
  }
  return out;
}

/** Apara o espaço das bordas da célula, como o `.trim()` do innerHTML fazia. */
function trimEdges(nodes: Node[]): Node[] {
  if (nodes.length === 0) return nodes;
  const first = nodes[0];
  if (first.nodeType === TEXT_NODE) first.textContent = String(first.textContent).replace(/^\s+/, "");
  const last = nodes[nodes.length - 1];
  if (last.nodeType === TEXT_NODE) last.textContent = String(last.textContent).replace(/\s+$/, "");
  return nodes;
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
      cells.forEach((cell, index) => {
        if (index > 0) paragraph.appendChild(doc.createTextNode(CELL_SEPARATOR));
        for (const node of trimEdges(inlineNodesOf(cell, doc))) paragraph.appendChild(node);
      });
      wrapper.appendChild(paragraph);
    }
    table.replaceWith(...(wrapper.childNodes.length > 0 ? [wrapper] : []));
  }

  return { html: doc.body.innerHTML, tables: tables.length };
}
