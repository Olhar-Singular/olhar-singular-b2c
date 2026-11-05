/**
 * Marcadores de "não consegui ler" (C-03). Onde o arquivo tinha algo que a leitura
 * não alcança (equação em objeto antigo, figura em formato ilegível), o texto diz
 * isso em voz alta em vez de deixar um buraco ("Calcule ."), porque um buraco convida a
 * IA a completar com um enunciado inventado.
 *
 * Duas pontas usam o mesmo texto: o cliente os escreve (docx-utils) e a extração por
 * IA os copia sem completar (prompt de examExtractionCore). A edge function importa este
 * arquivo por caminho relativo, como faz com `src/lib/adaptation`: não importe nada aqui.
 */

export const UNREAD_FORMULA = "[fórmula não lida]";
export const UNREAD_IMAGE = "[imagem não lida]";
export const UNREAD_OBJECT = "[objeto não lido]";

/** Qualquer um dos marcadores acima (e o que a IA escrever no mesmo molde). */
export const UNREAD_MARKER_PATTERN = /\[(?:fórmula|imagem|objeto|trecho)\s+não\s+lid[oa]\]/giu;

export function hasUnreadMarker(text: string): boolean {
  UNREAD_MARKER_PATTERN.lastIndex = 0;
  return UNREAD_MARKER_PATTERN.test(text);
}

/**
 * Verbo de comando seguido de nada: "Calcule ." ou "Qual é?". É o rastro que um objeto
 * perdido deixa no texto. Sem marcador, é lacuna. "Resolva:" não conta: os dois-pontos
 * introduzem os itens da linha de baixo.
 */
const COMMAND_VERBS =
  "calcule|resolva|determine|simplifique|fatore|efetue|encontre|obtenha|derive|integre|racionalize|ache|verifique|qual\\s+é|quanto\\s+é|quanto\\s+vale";
const BARE_COMMAND = new RegExp(`(?:^|[\\s(])(?:${COMMAND_VERBS})\\s*[.;?!]`, "iu");

/** Linhas cujo enunciado termina num verbo de comando sem objeto. */
export function findBareCommandLines(text: string): string[] {
  return text
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter((line) => line && !hasUnreadMarker(line) && BARE_COMMAND.test(line));
}
