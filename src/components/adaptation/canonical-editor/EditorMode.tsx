/**
 * EditorMode — context that tells the canonical editor whether it is editing
 * CONTENT (text + math + structure) or STYLE (formatting: bold / italic /
 * underline / strike / color).
 *
 * The Content step renders the editor WITHOUT a provider → `useEditorMode()`
 * defaults to `"content"`, so text-format controls stay hidden. The Estilo step
 * wraps the editor in `<EditorModeProvider value="style">` to turn formatting on.
 */

import { createContext, useContext, type ReactNode } from "react";

export type EditorMode = "content" | "style";

const EditorModeContext = createContext<EditorMode>("content");

export function EditorModeProvider({
  value,
  children,
}: {
  value: EditorMode;
  children: ReactNode;
}) {
  return <EditorModeContext.Provider value={value}>{children}</EditorModeContext.Provider>;
}

/** Returns the current editor mode, defaulting to `"content"` outside a provider. */
export function useEditorMode(): EditorMode {
  return useContext(EditorModeContext);
}
