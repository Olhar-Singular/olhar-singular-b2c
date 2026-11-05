/**
 * Helpers para os testes que leem a árvore react-pdf devolvida por um mapeador chamado
 * como função (sem layout).
 */
import type { ReactElement } from "react";

/** O marco `keepTogether` (nós de altura zero que seguram um grupo na mesma folha). */
const isKeepMarker = (node: unknown): boolean => {
  const key = (node as ReactElement | null)?.key;
  return typeof key === "string" && key.startsWith("keep-");
};

/** Os filhos de um nó sem os marcos de "ficar junto" e sem aninhamento de arrays. */
export function contentChildren(node: ReactElement): ReactElement[] {
  const children = (node.props as { children?: unknown }).children;
  return [children].flat(Infinity).filter((c) => c && !isKeepMarker(c)) as ReactElement[];
}
