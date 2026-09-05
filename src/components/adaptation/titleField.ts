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
export const TITLE_FIELD_LABEL = "Título (nome da adaptação e cabeçalho impresso)";

export const TITLE_FIELD_HINT =
  "Este texto nomeia a adaptação na sua lista e é impresso no topo da folha do aluno.";
