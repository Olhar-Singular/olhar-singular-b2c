/**
 * questionCardState — ephemeral "which question card is expanded" coordination.
 *
 * The expanded state is NOT part of the canonical document (round-trip stays
 * byte-identical — plano §9.3). It lives in a per-editor external store so that
 * opening one question card collapses any other (one card at a time, §6.3), and
 * every QuestionNodeView re-renders reliably via `useSyncExternalStore` — without
 * depending on dynamic React-context propagation through Tiptap node-view portals.
 *
 * The store is keyed by the editor instance (a WeakMap), so multiple editors on a
 * page never share expansion state and the store is GC'd with its editor.
 *
 * Achado 1106: the open card buffers its edits locally until Concluir. Switching
 * to another card used to just swap the id, unmounting the open card together
 * with its buffer — edits vanished silently. The open card now registers a leave
 * handler, and `expand(otherId)` runs it (committing the buffer) before swapping.
 * `collapse()` (Concluir / Cancelar / Esc already decided) only drops it.
 */

import { useCallback, useSyncExternalStore } from "react";
import type { Editor } from "@tiptap/react";

export interface QuestionCardStore {
  getExpandedId(): string | null;
  expand(id: string): void;
  collapse(): void;
  /**
   * Registers what the open card must do before another card takes its place.
   * Returns an unregister that only clears it if it is still the current one.
   */
  setLeaveHandler(handler: () => void): () => void;
  subscribe(listener: () => void): () => void;
}

const stores = new WeakMap<object, QuestionCardStore>();

function createStore(): QuestionCardStore {
  let expandedId: string | null = null;
  const listeners = new Set<() => void>();
  let leaveHandler: (() => void) | null = null;
  const set = (next: string | null) => {
    if (next === expandedId) return;
    expandedId = next;
    listeners.forEach((listener) => listener());
  };
  return {
    getExpandedId: () => expandedId,
    expand: (id) => {
      if (expandedId !== null && expandedId !== id && leaveHandler) {
        const leave = leaveHandler;
        leaveHandler = null;
        leave();
      }
      set(id);
    },
    collapse: () => {
      leaveHandler = null;
      set(null);
    },
    setLeaveHandler: (handler) => {
      leaveHandler = handler;
      return () => {
        if (leaveHandler === handler) leaveHandler = null;
      };
    },
    subscribe: (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
  };
}

/** Returns the (lazily created, cached) expansion store for an editor instance. */
export function getQuestionCardStore(key: object): QuestionCardStore {
  let store = stores.get(key);
  if (!store) {
    store = createStore();
    stores.set(key, store);
  }
  return store;
}

/**
 * Subscribes a question (by id) to its editor's card store. Returns whether THIS
 * question's card is the expanded one, plus actions to expand/collapse it.
 */
export function useQuestionCard(editor: Editor, id: string) {
  const store = getQuestionCardStore(editor);
  const expanded = useSyncExternalStore(store.subscribe, () => store.getExpandedId() === id);
  const expand = useCallback(() => store.expand(id), [store, id]);
  const collapse = useCallback(() => store.collapse(), [store]);
  const setLeaveHandler = useCallback((handler: () => void) => store.setLeaveHandler(handler), [store]);
  return { expanded, expand, collapse, setLeaveHandler };
}
