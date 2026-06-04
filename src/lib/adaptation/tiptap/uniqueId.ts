/**
 * UniqueId extension — guarantees every block node carries a stable `id`.
 *
 * On `appendTransaction`, any block node lacking an `id` (or carrying a
 * duplicate of one already seen in the document) is assigned a fresh
 * `newId()`. The decision logic is extracted into the pure, unit-testable
 * `assignMissingIds` so the id-assignment rules are covered without driving a
 * ProseMirror transaction.
 */

import { Extension } from "@tiptap/core";
import { Plugin, PluginKey } from "@tiptap/pm/state";
import { newId, isId } from "../canonical/ids";

/** Node types that must carry an `id`. */
export const ID_BEARING_TYPES = new Set([
  "heading",
  "paragraph",
  "blockMath",
  "image",
  "scaffolding",
  "divider",
  "question",
]);

/** A planned id assignment for a node at a document position. */
export interface IdAssignment {
  pos: number;
  id: string;
}

/** A minimal view of a positioned node, as produced by `doc.descendants`. */
export interface PositionedNode {
  pos: number;
  type: string;
  id: unknown;
}

/**
 * Pure decision logic: given the id-bearing nodes of a document (in document
 * order), return the assignments needed so that every such node has a valid,
 * unique id. Nodes that already have a valid, not-yet-seen id are left alone.
 *
 * `generate` is injected for deterministic testing (defaults to `newId`).
 */
export function assignMissingIds(
  nodes: PositionedNode[],
  generate: () => string = newId
): IdAssignment[] {
  const seen = new Set<string>();
  const assignments: IdAssignment[] = [];
  for (const node of nodes) {
    if (!ID_BEARING_TYPES.has(node.type)) continue;
    const current = node.id;
    if (isId(current) && !seen.has(current)) {
      seen.add(current);
      continue;
    }
    // Missing, invalid, or duplicate id -> generate a fresh unique one.
    let fresh = generate();
    /* v8 ignore next -- guard against the astronomically unlikely uuid clash */
    while (seen.has(fresh)) fresh = generate();
    seen.add(fresh);
    assignments.push({ pos: node.pos, id: fresh });
  }
  return assignments;
}

/** Minimal shape of a ProseMirror doc we traverse. */
export interface DescendableDoc {
  descendants: (
    cb: (node: { type: { name: string }; attrs: Record<string, unknown> }, pos: number) => void
  ) => void;
}

/** Minimal shape of a ProseMirror transaction we mutate. */
export interface AttrSettableTr {
  setNodeAttribute: (pos: number, name: string, value: unknown) => void;
}

/** Collect id-bearing nodes from a ProseMirror doc in document order. */
export function collectNodes(doc: DescendableDoc): PositionedNode[] {
  const nodes: PositionedNode[] = [];
  doc.descendants((node, pos) => {
    if (ID_BEARING_TYPES.has(node.type.name)) {
      nodes.push({ pos, type: node.type.name, id: node.attrs.id });
    }
  });
  return nodes;
}

/**
 * Apply id assignments for `doc` onto `tr`. Returns `tr` if anything was
 * assigned, or `null` when no node needed an id (so callers can skip an
 * empty transaction). Pure aside from mutating the provided `tr`.
 */
export function applyUniqueIds<T extends AttrSettableTr>(
  doc: DescendableDoc,
  tr: T
): T | null {
  const assignments = assignMissingIds(collectNodes(doc));
  if (assignments.length === 0) return null;
  for (const { pos, id } of assignments) {
    tr.setNodeAttribute(pos, "id", id);
  }
  return tr;
}

/** The Tiptap extension. */
export const UniqueId = Extension.create({
  name: "uniqueId",
  /* v8 ignore start -- Tiptap plugin registration glue; the decision logic it
     calls (applyUniqueIds/assignMissingIds/collectNodes) is unit-tested. */
  addProseMirrorPlugins() {
    return [
      new Plugin({
        key: new PluginKey("uniqueId"),
        appendTransaction: (_transactions, _oldState, newState) =>
          applyUniqueIds(newState.doc as DescendableDoc, newState.tr),
      }),
    ];
  },
  /* v8 ignore stop */
});
