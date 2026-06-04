/**
 * Schema/extension factory for the canonical Tiptap editor.
 *
 * `buildExtensions()` returns the extension list; `getEditorSchema()` resolves
 * it to a ProseMirror Schema via @tiptap/core's `getSchema`. The resolved
 * schema is what powers `Node.fromJSON` / `node.toJSON()` in the round-trip
 * tests — no browser/NodeView is required.
 */

import { getSchema } from "@tiptap/core";
import type { Schema } from "@tiptap/pm/model";
import { buildCanonicalExtensions } from "./schema";

/** The extension list for the canonical editor. */
export function buildExtensions() {
  return buildCanonicalExtensions();
}

/** Resolve the canonical extensions to a ProseMirror Schema. */
export function getEditorSchema(): Schema {
  return getSchema(buildExtensions());
}
