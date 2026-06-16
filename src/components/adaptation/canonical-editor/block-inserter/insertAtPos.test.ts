import { describe, it, expect, vi } from "vitest";
import type { Editor } from "@tiptap/react";
import { runInserterAction, type InserterAction } from "./insertAtPos";
import { getQuestionCardStore } from "../nodeviews/questionCardState";
import type { PMNode } from "@/lib/adaptation/tiptap/fromCanonical";
import type { BlockGap } from "./topLevelGaps";

/** Fake editor capturing the insert chain. */
function insertEditor() {
  const insertContentAt = vi.fn();
  const chain = {
    focus: () => chain,
    insertContentAt: (pos: number, node: PMNode) => {
      insertContentAt(pos, node);
      return chain;
    },
    run: () => true,
  };
  const editor = { chain: () => chain } as unknown as Editor;
  return { editor, insertContentAt };
}

/** Fake editor capturing the pageBreak command. */
function pageBreakEditor(node: { attrs: Record<string, unknown> } | null) {
  const setNodeAttribute = vi.fn();
  const nodeAt = vi.fn(() => node);
  let commandReturn: boolean | undefined;
  let chainStarted = false;
  const chain = {
    focus: () => chain,
    command: (fn: (p: { tr: unknown; state: unknown }) => boolean) => {
      commandReturn = fn({ tr: { setNodeAttribute }, state: { doc: { nodeAt } } });
      return chain;
    },
    run: () => true,
  };
  const editor = {
    chain: () => {
      chainStarted = true;
      return chain;
    },
  } as unknown as Editor;
  return { editor, setNodeAttribute, nodeAt, getReturn: () => commandReturn, started: () => chainStarted };
}

const insertGap: BlockGap = { index: 0, pos: 5, followingPos: 5 };
const followingGap: BlockGap = { index: 1, pos: 2, followingPos: 2 };
const trailingGap: BlockGap = { index: 9, pos: 30, followingPos: null };

describe("runInserterAction — insert", () => {
  it("inserts the built node at the gap position", () => {
    const { editor, insertContentAt } = insertEditor();
    const node: PMNode = { type: "paragraph", attrs: { id: "P1" } };
    runInserterAction(editor, insertGap, { type: "insert", build: () => node });
    expect(insertContentAt).toHaveBeenCalledWith(5, node);
    // a non-question insert never opens a card
    expect(getQuestionCardStore(editor).getExpandedId()).toBeNull();
  });

  it("opens the card of a freshly inserted question by its id", () => {
    const { editor } = insertEditor();
    const action: InserterAction = {
      type: "insert",
      build: () => ({ type: "question", attrs: { id: "Q1" } }),
    };
    runInserterAction(editor, insertGap, action);
    expect(getQuestionCardStore(editor).getExpandedId()).toBe("Q1");
  });

  it("does not open a card when the question node has no id", () => {
    const { editor } = insertEditor();
    runInserterAction(editor, insertGap, { type: "insert", build: () => ({ type: "question" }) });
    expect(getQuestionCardStore(editor).getExpandedId()).toBeNull();
  });
});

describe("runInserterAction — pageBreak", () => {
  it("sets pageBreakBefore on the following block, preserving its other style", () => {
    const { editor, setNodeAttribute, getReturn } = pageBreakEditor({
      attrs: { style: { align: "center" } },
    });
    runInserterAction(editor, followingGap, { type: "pageBreak" });
    expect(setNodeAttribute).toHaveBeenCalledWith(2, "style", {
      align: "center",
      pageBreakBefore: true,
    });
    expect(getReturn()).toBe(true);
  });

  it("defaults to an empty style when the following block has none", () => {
    const { editor, setNodeAttribute } = pageBreakEditor({ attrs: {} });
    runInserterAction(editor, followingGap, { type: "pageBreak" });
    expect(setNodeAttribute).toHaveBeenCalledWith(2, "style", { pageBreakBefore: true });
  });

  it("is a no-op (returns false) when the following node cannot be resolved", () => {
    const { editor, setNodeAttribute, getReturn } = pageBreakEditor(null);
    runInserterAction(editor, followingGap, { type: "pageBreak" });
    expect(setNodeAttribute).not.toHaveBeenCalled();
    expect(getReturn()).toBe(false);
  });

  it("never touches the editor at the trailing gap (no following block)", () => {
    const { editor, started } = pageBreakEditor({ attrs: {} });
    runInserterAction(editor, trailingGap, { type: "pageBreak" });
    expect(started()).toBe(false);
  });
});
