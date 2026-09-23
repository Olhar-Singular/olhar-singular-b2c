/**
 * Região viva única da folha (achado 0256).
 *
 * Mudança estrutural feita pelo chrome da folha (excluir questão, imagem, apoio
 * ou fórmula) não gera nenhum anúncio: o alertdialog cobre o momento de
 * *perguntar*, mas ao confirmar ele desmonta e o leitor de tela só narra o novo
 * ponto do cursor. Quem não vê a folha não distingue "excluiu a questão certa"
 * de "excluiu a errada" — as duas soam iguais (silêncio).
 *
 * Duas exigências de leitor de tela moldam este módulo:
 *
 * 1. A região precisa estar montada ANTES de o texto mudar. Região viva inserida
 *    junto com o conteúdo não é anunciada — por isso o texto é escrito numa
 *    tarefa seguinte (`setTimeout`), nunca no mesmo tick da criação.
 * 2. O texto precisa MUDAR a cada evento. Duas exclusões seguidas com a mesma
 *    frase não disparariam o segundo anúncio, então uma repetição ganha um
 *    espaço fixo invisível que alterna o conteúdo do nó.
 *
 * A região mora no `document.body`, fora da árvore do ProseMirror: qualquer nó
 * dentro da folha seria removido pela própria exclusão que ele anuncia.
 */

const REGION_ID = "canonical-editor-live-region";

/** Sufixo invisível que força o nó de texto a mudar numa repetição. */
const NUDGE = " ";

function ensureRegion(): HTMLElement {
  const existing = document.getElementById(REGION_ID);
  if (existing) return existing;
  const region = document.createElement("p");
  region.id = REGION_ID;
  region.setAttribute("role", "status");
  region.setAttribute("aria-live", "polite");
  region.className = "sr-only";
  document.body.appendChild(region);
  return region;
}

/**
 * Anuncia `message` na região viva da folha, criando-a se ainda não existir.
 * Mensagem vazia não anuncia nada (e não cria região à toa).
 */
export function announceOnSheet(message: string): void {
  if (!message) return;
  const region = ensureRegion();
  setTimeout(() => {
    region.textContent = region.textContent === message ? `${message}${NUDGE}` : message;
  }, 0);
}
