/**
 * Ordem de tabulação dos "+" do inserter (achado 0274).
 *
 * O overlay de inserção é irmão do `EditorContent`, então na ordem do DOM todos
 * os "+" vêm depois do documento inteiro: quem navega por teclado atravessava a
 * folha toda e voltava ao topo para inserir num ponto. Mover os botões para
 * dentro do DOM do ProseMirror não é opção (o editor reconcilia o próprio DOM e
 * descarta nós estranhos), então a sequência desejada é calculada aqui e o
 * overlay redireciona o Tab por ela.
 *
 * Funções puras sobre DOM, sem editor, para teste direto.
 */

const CANDIDATES = 'button, [href], input, select, textarea, [tabindex], [contenteditable="true"]';

/** Se o elemento é uma parada de Tab (heurística sem layout, roda no jsdom). */
function isStop(el: HTMLElement): boolean {
  if (el.getAttribute("contenteditable") === "true") {
    // Só o HOST de edição é parada; descendentes editáveis herdam o host.
    const host = el.parentElement?.closest("[contenteditable]");
    return host?.getAttribute("contenteditable") !== "true";
  }
  if ((el as HTMLButtonElement).disabled) return false;
  return el.tabIndex >= 0;
}

/** Paradas de Tab do editor (raiz inclusa), na ordem do DOM. */
export function collectEditorStops(root: HTMLElement): HTMLElement[] {
  const all = [root, ...Array.from(root.querySelectorAll<HTMLElement>(CANDIDATES))];
  return all.filter(isStop);
}

/** Se `stop` está dentro de `anchor` ou depois dele no documento. */
function atOrAfter(anchor: Node, stop: Node): boolean {
  if (anchor === stop || anchor.contains(stop)) return true;
  return (anchor.compareDocumentPosition(stop) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0;
}

/**
 * Intercala os "+" nas paradas do editor. `anchors[i]` é o DOM do bloco que vem
 * depois da lacuna i (null na lacuna final); o "+" da lacuna entra logo antes da
 * primeira parada que está nesse bloco ou depois dele. Lacunas chegam em ordem
 * de documento, então a intercalação é um merge.
 */
export function interleaveGapStops(
  stops: HTMLElement[],
  anchors: (Node | null)[],
  pluses: HTMLElement[],
): HTMLElement[] {
  const out: HTMLElement[] = [];
  let g = 0;
  for (const stop of stops) {
    while (g < pluses.length && anchors[g] && atOrAfter(anchors[g] as Node, stop)) {
      out.push(pluses[g++]);
    }
    out.push(stop);
  }
  while (g < pluses.length) out.push(pluses[g++]);
  return out;
}
