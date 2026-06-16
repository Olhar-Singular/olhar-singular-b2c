import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import type { Editor } from "@tiptap/react";
import { getQuestionCardStore, useQuestionCard } from "./questionCardState";

const fakeEditor = () => ({}) as unknown as Editor;

describe("questionCardState store", () => {
  it("returns the same store for the same editor key", () => {
    const key = fakeEditor();
    expect(getQuestionCardStore(key)).toBe(getQuestionCardStore(key));
  });

  it("returns different stores for different editor keys", () => {
    expect(getQuestionCardStore(fakeEditor())).not.toBe(getQuestionCardStore(fakeEditor()));
  });

  it("starts collapsed (no expanded id)", () => {
    expect(getQuestionCardStore(fakeEditor()).getExpandedId()).toBeNull();
  });

  it("expand sets the expanded id and collapse clears it", () => {
    const store = getQuestionCardStore(fakeEditor());
    store.expand("a");
    expect(store.getExpandedId()).toBe("a");
    store.collapse();
    expect(store.getExpandedId()).toBeNull();
  });

  it("keeps only one id expanded at a time", () => {
    const store = getQuestionCardStore(fakeEditor());
    store.expand("a");
    store.expand("b");
    expect(store.getExpandedId()).toBe("b");
  });

  it("notifies subscribers on change and stops after unsubscribe", () => {
    const store = getQuestionCardStore(fakeEditor());
    const listener = vi.fn();
    const unsubscribe = store.subscribe(listener);
    store.expand("a");
    expect(listener).toHaveBeenCalledTimes(1);
    unsubscribe();
    store.collapse();
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it("does not notify when expanding the already-expanded id", () => {
    const store = getQuestionCardStore(fakeEditor());
    const listener = vi.fn();
    store.subscribe(listener);
    store.expand("a");
    store.expand("a");
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe("useQuestionCard hook", () => {
  it("starts collapsed and toggles this id via expand/collapse", () => {
    const editor = fakeEditor();
    const { result } = renderHook(() => useQuestionCard(editor, "q1"));
    expect(result.current.expanded).toBe(false);
    act(() => result.current.expand());
    expect(result.current.expanded).toBe(true);
    act(() => result.current.collapse());
    expect(result.current.expanded).toBe(false);
  });

  it("expanding one id collapses another card on the same editor", () => {
    const editor = fakeEditor();
    const a = renderHook(() => useQuestionCard(editor, "a"));
    const b = renderHook(() => useQuestionCard(editor, "b"));
    act(() => a.result.current.expand());
    expect(a.result.current.expanded).toBe(true);
    expect(b.result.current.expanded).toBe(false);
    act(() => b.result.current.expand());
    expect(a.result.current.expanded).toBe(false);
    expect(b.result.current.expanded).toBe(true);
  });
});
