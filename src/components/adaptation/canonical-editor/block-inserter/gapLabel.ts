/**
 * Nome acessível de cada lacuna do inserter "+" (achado 0220).
 *
 * A camada do `BlockInserter` é um overlay absoluto renderizado depois do
 * `EditorContent`: na ordem de foco os três "+" aparecem juntos, no fim, longe
 * do bloco que cada um toca. Enquanto todos se chamavam "Inserir bloco", quem
 * navega por teclado ou leitor de tela recebia três controles idênticos sem
 * pista nenhuma de onde cada inserção cai.
 *
 * O `BlockGap` já carrega a posição; aqui ela vira texto, descrevendo o bloco
 * vizinho por tipo, ordem dentro do tipo e um trecho do próprio conteúdo. Tipo
 * + ordinal garante que dois blocos nunca produzam o mesmo nome, mesmo quando o
 * texto é igual (dois parágrafos vazios, duas questões sem enunciado).
 *
 * Puro de propósito (só lê o doc do ProseMirror), para ser testável sem editor.
 */

import type { Node as PMNode } from "@tiptap/pm/model";
import type { BlockGap } from "./topLevelGaps";

/** Rótulo em pt-BR de cada tipo de bloco de topo do schema canônico. */
const TYPE_LABELS: Record<string, string> = {
  paragraph: "parágrafo",
  heading: "título",
  question: "questão",
  image: "imagem",
  blockMath: "fórmula",
  divider: "divisória",
  scaffolding: "banco de palavras",
};

/** Tamanho máximo do trecho de conteúdo citado no nome. */
const SNIPPET_MAX = 40;

function snippet(text: string): string {
  return text.length > SNIPPET_MAX ? `${text.slice(0, SNIPPET_MAX).trimEnd()}…` : text;
}

/**
 * Descreve o i-ésimo bloco de topo: tipo, ordem dentro do tipo e, quando há
 * texto, um trecho dele (ex.: `parágrafo 2 "Leia o texto"`, `divisória 1`).
 */
export function describeBlock(doc: PMNode, index: number): string {
  const node = doc.child(index);
  const typeName = node.type.name;
  const label = TYPE_LABELS[typeName];
  /* v8 ignore next -- todo bloco de topo do schema canônico tem rótulo acima */
  if (label === undefined) return "bloco";
  let ordinal = 0;
  for (let i = 0; i <= index; i++) {
    if (doc.child(i).type.name === typeName) ordinal += 1;
  }
  const base = `${label} ${ordinal}`;
  const text = node.textContent.trim();
  return text === "" ? base : `${base} "${snippet(text)}"`;
}

/** Nome acessível do "+" desta lacuna, dizendo onde a inserção cai. */
export function gapLabel(doc: PMNode, gap: BlockGap): string {
  if (gap.followingPos === null) {
    return `Inserir bloco após ${describeBlock(doc, doc.childCount - 1)}`;
  }
  return `Inserir bloco antes de ${describeBlock(doc, gap.index)}`;
}
