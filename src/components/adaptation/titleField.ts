/**
 * Rótulo e texto auxiliar do ÚNICO campo de título da adaptação.
 *
 * Achado 0250: o campo "Nome da adaptação" (chrome do passo Revisar) e o campo
 * "Título" (passo Exportar) sempre foram o mesmo dado — `header.title`. Dois
 * rótulos diferentes davam a impressão de duas coisas: quem preenchia o Título
 * do Exportar renomeava a adaptação na lista (o autosave copia o header para a
 * coluna `title`), e quem só dava um nome de arquivamento no Revisar acabava
 * imprimindo esse nome como cabeçalho na folha do aluno.
 *
 * A decisão aqui é a segunda opção do achado: assumir que é um campo só. Um
 * rótulo idêntico nos dois passos e uma frase dizendo os dois efeitos. Separar
 * de verdade (nome próprio fora do `header`) mexeria no schema canônico, que é
 * área frágil e não cabe numa correção autônoma.
 *
 * Os dois passos importam daqui para que nunca voltem a divergir.
 */
import type { Block, CanonicalDocument } from "@/lib/adaptation/canonical/schema";

export const TITLE_FIELD_LABEL = "Título (nome da adaptação e cabeçalho impresso)";

export const TITLE_FIELD_HINT =
  "Este texto nomeia a adaptação na sua lista e é impresso no topo da folha do aluno.";

/**
 * Texto usado quando o professor não nomeou a adaptação e o documento não tem
 * nenhum heading para sugerir um nome.
 */
export const FALLBACK_TITLE = "Atividade adaptada";

/**
 * Título derivado do documento: texto puro do primeiro `heading`, ou o fallback.
 *
 * Achado 0185: isto era privado do `StepReview`, e só o campo do Revisar mostrava
 * a sugestão. O campo do Exportar — o MESMO `header.title` — vinha vazio, um
 * passo depois, sem sugestão e sem selo. O professor lia um nome no passo 5 e a
 * caixa vazia no 6, sem nada na tela dizendo qual dos dois valia (vale o vazio:
 * `PdfHeader` só imprime a linha do título quando `header.title` não é vazio).
 * Mora aqui, ao lado do rótulo, para que os dois passos mostrem o mesmo estado.
 */
export function documentTitle(doc: CanonicalDocument): string {
  const heading = doc.blocks.find(
    (b): b is Extract<Block, { type: "heading" }> => b.type === "heading",
  );
  if (!heading) return FALLBACK_TITLE;
  const text = heading.content
    .map((n) => (n.type === "text" ? n.text : ""))
    .join("")
    .trim();
  return text || FALLBACK_TITLE;
}
