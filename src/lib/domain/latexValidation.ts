/**
 * latexParseError — pergunta ao KaTeX se uma expressão parseia, e devolve a
 * razão em texto quando não parseia.
 *
 * O renderizador da folha chama o KaTeX com `throwOnError: false` de propósito:
 * o documento não pode parar de renderizar por causa de uma fórmula quebrada.
 * O efeito colateral é que o erro vira só um `<span class="katex-error">`
 * vermelho — cor, sem texto, não anunciado por leitor de tela, e invisível no
 * PDF (que imprime LaTeX cru). Por isso a VALIDAÇÃO é uma pergunta separada da
 * renderização, feita com `throwOnError: true` num try/catch: mesmo parser,
 * mesma resposta, só que dizível (achado 0434, WCAG 3.3.1).
 */

import katex from "katex";

/**
 * @returns `null` quando o LaTeX parseia (ou está vazio — o vazio é tratado
 * pelo rascunho do campo, ver `useLatexDraft`), ou a razão do KaTeX sem o
 * prefixo "KaTeX parse error:", que é ruído de biblioteca numa frase que vai
 * para a tela do professor.
 */
export function latexParseError(latex: string): string | null {
  if (latex.length === 0) return null;
  try {
    katex.renderToString(latex, { throwOnError: true, strict: false, output: "htmlAndMathml" });
    return null;
  } catch (error) {
    return String((error as Error).message).replace(/^KaTeX parse error:\s*/, "");
  }
}
