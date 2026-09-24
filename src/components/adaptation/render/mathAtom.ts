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

/**
 * A descrição legível da fórmula, quando o nó traz uma.
 *
 * Todo nó de math carrega um `alt` em português, e as duas views de tela já
 * imprimem `alt ?? latex`. As superfícies de ARQUIVO descartavam o campo e
 * entregavam LaTeX cru ao aluno, numa folha cuja razão de existir é remover
 * barreira de leitura (achado 0401). Enquanto o math não for tipografado de
 * verdade no PDF/Word, o fallback impresso é esta descrição; o LaTeX fica para
 * quem não tem `alt`.
 *
 * Devolve `null` (e não `""`) para o nó sem descrição, para que quem chama
 * escolha explicitamente o caminho do LaTeX, que tem costura e quebra próprias.
 */
export function readableMathText(node: { latex: string; alt?: string }): string | null {
  const alt = node.alt?.trim();
  return alt ? alt : null;
}
