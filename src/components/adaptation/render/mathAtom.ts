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

/** Um corte: onde a linha termina, por onde a próxima começa, e se foi forçado (sem espaço). */
interface Cut {
  end: number;
  next: number;
  forced: boolean;
}

/**
 * Pode a quebra cair entre `rest[i - 1]` e `rest[i]` sem mudar o que o LaTeX diz?
 * Não, se ela caísse dentro de um comando (`\sq` / `rt`) ou entre a barra e o que ela
 * escapa (`\` / `{`). Espaço em LaTeX de matemática não é significativo, então fora
 * disso a quebra é neutra.
 */
function isSafeCut(rest: string, i: number): boolean {
  let slashes = 0;
  for (let j = i - 1; j >= 0 && rest[j] === "\\"; j -= 1) slashes += 1;
  if (slashes % 2 === 1) return false; // logo depois de uma barra solta
  if (/[A-Za-z]/.test(rest[i - 1]) && /[A-Za-z]/.test(rest[i])) {
    let j = i - 1;
    while (j >= 0 && /[A-Za-z]/.test(rest[j])) j -= 1;
    if (rest[j] === "\\") return false; // dentro de \comando
  }
  return true;
}

/** 1 = ponto natural (depois de operador ou fecho, ou antes de comando); 2 = neutro; 3 = ruim (parte um número ou uma palavra). */
function cutTier(rest: string, i: number): 1 | 2 | 3 {
  const before = rest[i - 1];
  const after = rest[i];
  if ("+=,;<>".includes(before)) return 1;
  if (after === "\\" && before !== "\\") return 1;
  if (")]}".includes(before) && !"{^_".includes(after)) return 1;
  if (/\d/.test(before) && /\d/.test(after)) return 3;
  if (/[A-Za-z]/.test(before) && /[A-Za-z]/.test(after)) return 3;
  return 2;
}

/**
 * Corte forçado, para quando não há espaço no trecho que cabe: o melhor ponto seguro
 * perto do alvo, preferindo operador a fecho a meio de palavra (e nunca dentro de um
 * comando). Sem nenhum ponto seguro (coluna menor que um comando) corta no limite.
 */
function forcedCut(rest: string, target: number, maxChars: number): Cut {
  const hi = Math.min(maxChars, rest.length - 1);
  const lo = Math.max(1, Math.floor(maxChars / 2));
  let best = -1;
  let bestTier = 4;
  for (let i = lo; i <= hi; i += 1) {
    if (!isSafeCut(rest, i)) continue;
    const tier = cutTier(rest, i);
    if (tier < bestTier || (tier === bestTier && Math.abs(i - target) < Math.abs(best - target))) {
      best = i;
      bestTier = tier;
    }
  }
  if (best < 0) {
    // nothing safe in the window: look further left before giving up on a whole command
    for (let i = lo - 1; i >= 1 && best < 0; i -= 1) if (isSafeCut(rest, i)) best = i;
  }
  const end = best < 0 ? Math.max(1, hi) : best;
  return { end, next: end, forced: true };
}

/**
 * Onde cortar `rest` para que a linha fique perto de `target` caracteres.
 *
 * Devolve o fim da linha e por onde continuar (o espaço usado na quebra é
 * consumido). Sem nenhum espaço no trecho que cabe, corta num ponto seguro
 * (`forcedCut`), nunca no meio de um comando.
 */
function balancedCut(rest: string, target: number, maxChars: number): Cut {
  const head = rest.slice(0, maxChars + 1);
  let best = -1;
  for (let i = 0; i < head.length; i += 1) {
    if (!/\s/.test(head[i])) continue;
    if (best < 0 || Math.abs(i - target) < Math.abs(best - target)) best = i;
  }
  return best < 0 ? forcedCut(rest, target, maxChars) : { end: best, next: best + 1, forced: false };
}

/** Quebra o LaTeX em trechos de no máximo `maxChars`, dizendo como cada um se une ao anterior. */
function cutLatex(latex: string, maxChars: number): Array<{ line: string; forced: boolean }> {
  const width = Math.max(1, maxChars);
  const lines: Array<{ line: string; forced: boolean }> = [];
  let rest = latex.trim();
  let forced = false;
  while (rest.length > width) {
    const target = Math.ceil(rest.length / Math.ceil(rest.length / width));
    const cut = balancedCut(rest, target, width);
    lines.push({ line: rest.slice(0, cut.end), forced });
    forced = cut.forced;
    rest = rest.slice(cut.next).trimStart();
  }
  lines.push({ line: rest, forced });
  return lines;
}

/**
 * Quebra o LaTeX em linhas EQUILIBRADAS de no máximo `maxChars` caracteres,
 * cada uma já costurada em átomo (`latexLayoutAtom`).
 *
 * A quebra mira `ceil(sobra / linhas que faltam)` em vez de saturar a linha
 * (achado 0435) e, entre os espaços candidatos, ganha o mais próximo do alvo:
 * o LaTeX segue legível nos pedaços. Sem espaço, corta num ponto seguro (depois
 * de um operador, de um fecho), nunca dentro de um comando nem de um número
 * quando há coisa melhor (N-M-001).
 *
 * Independe de renderer: o PDF (`mathBlockLines`, achado 0433) e o Word (achado
 * 0390) só diferem no teto que passam. Sem isso o Word recebia a fórmula
 * inteira como um átomo sem teto e, sem ponto de quebra legal, partia no meio
 * de um comando (`\` numa linha, `frac{3}{4}` na outra).
 */
export function latexBalancedLines(latex: string, maxChars: number): string[] {
  return cutLatex(latex, maxChars).map(({ line }) => latexLayoutAtom(line, Math.max(1, maxChars)));
}

/** Um pedaço de fórmula inline e como ele se une ao anterior. */
export interface MathSegment {
  text: string;
  /**
   * `none`: o primeiro. `space`: havia um espaço do LaTeX ali (a quebra o consome, o
   * olho vê o mesmo vão de antes). `soft`: corte NOSSO no meio de um token, sem espaço
   * no original: a quebra não pode desenhar hífen nem deixar vão.
   */
  joint: "none" | "space" | "soft";
}

/**
 * A fórmula INLINE como pedaços, para uma coluna de `maxChars` caracteres.
 *
 * Cabendo, é UM átomo (achado 0425: a fórmula desce inteira). Não cabendo, vira
 * pedaços que cabem, cada um um átomo, unidos onde o LaTeX tinha espaço ou num
 * ponto seguro; quem imprime deixa o quebrador de linha cair numa dessas juntas,
 * sem hífen e sem perder caractere (N-M-001, N-U-001). Um token mais largo que a
 * coluna não pode ser átomo: o textkit o poria numa linha só e o papel o cortaria.
 */
export function latexLayoutSegments(latex: string, maxChars: number): MathSegment[] {
  const trimmed = latex.trim();
  if (trimmed.length <= Math.max(1, maxChars)) {
    return [{ text: latexLayoutAtom(trimmed), joint: "none" }];
  }
  // One char less: a piece that ends a line keeps the space that joined it (NBSP, see PdfRichText).
  return cutLatex(trimmed, maxChars - 1).map(({ line, forced }, i) => ({
    text: latexLayoutAtom(line),
    joint: i === 0 ? "none" : forced ? "soft" : "space",
  }));
}
