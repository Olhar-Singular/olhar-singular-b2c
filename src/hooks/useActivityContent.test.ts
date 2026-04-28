import { describe, it, expect, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useActivityContent } from "./useActivityContent";

describe("useActivityContent", () => {
  it("seeds dsl and registry from initial values", () => {
    const { result } = renderHook(() =>
      useActivityContent({ initialDsl: "1) Q", initialRegistry: {} }),
    );
    expect(result.current.dsl).toBe("1) Q");
    expect(result.current.dslExpanded).toBe("1) Q");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("normalizes inline image URLs into the registry on seed", () => {
    const { result } = renderHook(() =>
      useActivityContent({
        initialDsl: "1) Q\n[img:https://example.com/x.png]\n",
        initialRegistry: {},
      }),
    );
    expect(result.current.registry["imagem-1"]).toBe("https://example.com/x.png");
    expect(result.current.dsl).toContain("[img:imagem-1]");
    expect(result.current.dslExpanded).toContain("https://example.com/x.png");
  });

  it("setDsl pushes new state when dsl changes", () => {
    const { result } = renderHook(() =>
      useActivityContent({ initialDsl: "old", initialRegistry: {} }),
    );
    act(() => result.current.setDsl("new"));
    expect(result.current.dsl).toBe("new");
    expect(result.current.canUndo).toBe(true);
  });

  it("setDsl is a no-op when neither dsl nor registry changes", () => {
    const { result } = renderHook(() =>
      useActivityContent({ initialDsl: "same", initialRegistry: {} }),
    );
    act(() => result.current.setDsl("same"));
    expect(result.current.canUndo).toBe(false);
  });

  it("undo/redo navigate the history", () => {
    const { result } = renderHook(() =>
      useActivityContent({ initialDsl: "v1", initialRegistry: {} }),
    );
    act(() => result.current.setDsl("v2"));
    act(() => result.current.undo());
    expect(result.current.dsl).toBe("v1");
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.redo());
    expect(result.current.dsl).toBe("v2");
  });

  it("reset replaces present (and previous becomes part of history)", () => {
    const { result } = renderHook(() =>
      useActivityContent({ initialDsl: "v1", initialRegistry: {} }),
    );
    act(() => result.current.reset({ dsl: "fresh", registry: {} }));
    expect(result.current.dsl).toBe("fresh");
    expect(result.current.canUndo).toBe(true);
  });

  it("invokes onChange with new content state on each mutation", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() =>
      useActivityContent({ initialDsl: "v1", initialRegistry: {}, onChange }),
    );
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.setDsl("v2"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].dsl).toBe("v2");
  });

  it("expanded dsl reflects registry", () => {
    const { result } = renderHook(() =>
      useActivityContent({
        initialDsl: "x [img:imagem-1]",
        initialRegistry: { "imagem-1": "https://y.png" },
      }),
    );
    expect(result.current.dslExpanded).toContain("https://y.png");
  });
});
