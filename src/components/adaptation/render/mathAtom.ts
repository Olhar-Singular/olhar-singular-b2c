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

/** Devolve o LaTeX com todo espaço em branco trocado por espaço inquebrável. */
export function latexLayoutAtom(latex: string): string {
  return latex.replace(/\s/g, MATH_NBSP);
}
