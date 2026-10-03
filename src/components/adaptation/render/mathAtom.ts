/**
 * Fórmula como átomo de layout.
 *
 * Na tela o KaTeX desenha `.katex` como `inline-block` (`RichTextView`): a
 * fórmula é uma caixa que cabe inteira na linha ou desce inteira. No PDF e no
 * Word, porém, o LaTeX cru viaja como texto comum, e cada espaço dentro dele é
 * uma oportunidade de quebra do quebrador de linha. Resultado no papel:
 * `(x+1)^2` fechando uma linha e `= 0` abrindo a seguinte, com a segunda metade
 * grudada na frase de baixo (achado 0425).
 *
 * A correção é costurar os espaços do LaTeX com espaço inquebrável, para que a
 * quebra caia ENTRE a fórmula e o texto ao redor, nunca dentro dela. Vale para
 * as duas superfícies que imprimem LaTeX cru — PDF e `.docx` —, e por isso mora
 * aqui e não dentro do mapper de nenhuma das duas.
 */

/** Espaço inquebrável (U+00A0) que substitui os espaços do LaTeX. */
export const MATH_NBSP = "\u00a0";

/**
 * Devolve o LaTeX com todo espaço em branco trocado por espaço inquebrável.
 *
 * `maxAtomChars` é o teto de largura da coluna que vai imprimir a fórmula, em
 * caracteres. Acima dele o átomo é abandonado e o LaTeX volta quebrável: uma
 * "palavra" mais larga que a linha não tem quebra possível, e o quebrador do
 * `@react-pdf` reage a isso inventando um hífen e DESCARTANDO o excedente: a
 * fórmula em bloco de 84 caracteres chegava ao papel com 57, sem somatório e sem
 * aviso nenhum (achado 0427). Entre uma fórmula partida em dois pedaços legíveis
 * e uma fórmula errada, o conteúdo completo vence a diagramação.
 *
 * Sem o teto (o default) nada muda: quem imprime numa coluna que não sabe medir
 * continua costurando a fórmula inteira, como no achado 0425.
 */
export function latexLayoutAtom(latex: string, maxAtomChars = Infinity): string {
  if (latex.length > maxAtomChars) return latex;
  return latex.replace(/\s/g, MATH_NBSP);
}

/** Avanço de um caractere monoespaçado (Courier / Courier New), em `em`. */
export const MONO_ADVANCE_EM = 0.6;

/**
 * Onde cortar `rest` para que a linha fique perto de `target` caracteres.
 *
 * Devolve o fim da linha e por onde continuar (o espaço usado na quebra é
 * consumido). Sem nenhum espaço no trecho que cabe, corta no seco no alvo.
 */
function balancedCut(rest: string, target: number, maxChars: number): { end: number; next: number } {
  const head = rest.slice(0, maxChars + 1);
  let best = -1;
  for (let i = 0; i < head.length; i += 1) {
    if (!/\s/.test(head[i])) continue;
    if (best < 0 || Math.abs(i - target) < Math.abs(best - target)) best = i;
  }
  return best < 0 ? { end: target, next: target } : { end: best, next: best + 1 };
}

/**
 * Quebra o LaTeX em linhas EQUILIBRADAS de no máximo `maxChars` caracteres,
 * cada uma já costurada em átomo (`latexLayoutAtom`).
 *
 * A quebra mira `ceil(sobra / linhas que faltam)` em vez de saturar a linha
 * (achado 0435) e, entre os espaços candidatos, ganha o mais próximo do alvo:
 * o LaTeX segue legível nos pedaços. Só corta no seco quando não há espaço.
 *
 * Independe de renderer: o PDF (`mathBlockLines`, achado 0433) e o Word (achado
 * 0390) só diferem no teto que passam. Sem isso o Word recebia a fórmula
 * inteira como um átomo sem teto e, sem ponto de quebra legal, partia no meio
 * de um comando (`\` numa linha, `frac{3}{4}` na outra).
 */
export function latexBalancedLines(latex: string, maxChars: number): string[] {
  const lines: string[] = [];
  let rest = latex.trim();
  while (rest.length > maxChars) {
    const target = Math.ceil(rest.length / Math.ceil(rest.length / maxChars));
    const { end, next } = balancedCut(rest, target, maxChars);
    lines.push(rest.slice(0, end));
    rest = rest.slice(next).trimStart();
  }
  lines.push(rest);
  return lines.map((line) => latexLayoutAtom(line, maxChars));
}
