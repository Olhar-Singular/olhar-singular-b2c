/**
 * OriginalDocExtension — Tiptap extension that captures a JSON snapshot of every
 * `question` node when the editor is first created (this session's "original").
 *
 * Stored in `editor.storage.originalDoc.snapshots` as a `Map<questionId, nodeJSON>`.
 * `QuestionNodeView` reads this to offer a "Restaurar questão ao original" action.
 *
 * The snapshot is taken once, at `onCreate`, before any user edits. If the
 * document was already edited in a previous session and re-loaded, the "original"
 * reflects the DB state at load time — not the AI-generated version. A future
 * feature could compare against `adaptation_result.document` for a true "AI original".
 */

import { Extension } from "@tiptap/core";

export type QuestionNodeJSON = unknown;

export const OriginalDocExtension = Extension.create({
  name: "originalDoc",

  addStorage() {
    return {
      snapshots: new Map<string, QuestionNodeJSON>(),
    };
  },

  onCreate() {
    this.editor.state.doc.descendants((node) => {
      if (node.type.name === "question") {
        const id = node.attrs.id as string;
        // Only capture the first time — never overwrite with later document states.
        /* v8 ignore next -- descendants callback; covered by integration/round-trip tests */
        if (!this.storage.snapshots.has(id)) {
          this.storage.snapshots.set(id, node.toJSON());
        }
      }
    });
  },
});
