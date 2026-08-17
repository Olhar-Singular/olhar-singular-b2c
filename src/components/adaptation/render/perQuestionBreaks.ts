/**
 * Regra do "Quebra de página por questão", compartilhada pela prévia e pelo PDF.
 *
 * O switch do ExportPanel força cada questão a começar numa página nova. Como
 * quebrar "antes da página 1" não existe no impresso, a primeira questão nunca é
 * marcada — só da segunda em diante. Blocos que não são questão nunca quebram.
 *
 * A regra morava só dentro do `AdaptationPdf`, então o PDF saía com duas páginas
 * e a prévia continuava uma folha contínua (achado 0110). Extraída aqui para que
 * as duas superfícies leiam a mesma derivação e não voltem a divergir.
 */

import type { Block } from "@/lib/adaptation/canonical/schema";

/**
 * Um booleano por bloco (index-aligned com `blocks`): `true` onde a questão deve
 * começar numa página nova quando o switch está ligado.
 */
export function perQuestionBreakFlags(blocks: readonly Block[]): boolean[] {
  let questionsSeen = 0;
  return blocks.map((block) => {
    const isQuestion = block.type === "question";
    const forceBreak = isQuestion && questionsSeen > 0;
    if (isQuestion) questionsSeen += 1;
    return forceBreak;
  });
}
