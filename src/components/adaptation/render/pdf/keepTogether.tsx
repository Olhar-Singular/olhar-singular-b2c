/**
 * keepTogether — o marco de "este grupo fica junto na mesma folha" (achados 0530, N-U-004).
 *
 * O react-pdf só quebra ANTES de um nó que tem irmão anterior, e `minPresenceAhead` mede
 * a presença à frente do nó (limitada ao fim do último irmão). Por isso o marco é um par:
 * um nó de altura zero que abre o grupo e, depois dele, o que exige a presença. Quando a
 * presença falta, o grupo desce inteiro; no topo da folha ela já está cumprida e o
 * react-pdf não abre folha em branco. Nada vira `wrap={false}`: grupo maior que a folha
 * continua fatiável e nada é cortado.
 *
 * Devolve nós de altura zero para serem os PRIMEIROS filhos do grupo. Não é um
 * componente (os testes chamam os mapeadores como função, sem hooks nem contexto).
 */
import { View } from "@react-pdf/renderer";
import { PAGE_HEIGHT_PT, PAGE_MARGIN_PT } from "../pageTokens";

/**
 * A área útil da folha. O `- 1` absorve o arredondamento do token: o A4 do react-pdf tem
 * 841,89pt, não 842, e a presença de uma folha cheia ficava 0,11pt acima do que a folha
 * oferece.
 */
export const KEEP_PAGE_PT = PAGE_HEIGHT_PT - 2 * PAGE_MARGIN_PT - 1;

/**
 * Questão de alternativas curta (até meia folha) viaja inteira: enunciado e alternativas
 * na mesma folha. Maior que isso, o enunciado flui e só as alternativas se seguram juntas
 * (`KEEP_PAGE_PT`), senão um texto-base longo deixaria meia folha em branco.
 */
export const KEEP_QUESTION_PT = Math.floor(KEEP_PAGE_PT / 2);

export function keepTogether(presencePt: number) {
  return [
    <View key="keep-open" style={{ height: 0 }} />,
    <View key="keep-presence" style={{ height: 0 }} minPresenceAhead={presencePt} />,
  ];
}
