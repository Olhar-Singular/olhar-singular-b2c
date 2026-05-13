import { renderHook, act } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useHistory } from "./useHistory";

describe("useHistory", () => {
  it("starts with the initial value as present and no past/future", () => {
    const { result } = renderHook(() => useHistory("a"));
    expect(result.current.current).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(false);
  });

  it("set() pushes the previous present onto past", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    expect(result.current.current).toBe("b");
    expect(result.current.canUndo).toBe(true);
    expect(result.current.canRedo).toBe(false);
  });

  it("undo() restores the previous present and moves current to future", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => result.current.undo());
    expect(result.current.current).toBe("a");
    expect(result.current.canUndo).toBe(false);
    expect(result.current.canRedo).toBe(true);
  });

  it("redo() reapplies an undone change", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => result.current.undo());
    act(() => result.current.redo());
    expect(result.current.current).toBe("b");
    expect(result.current.canRedo).toBe(false);
  });

  it("set() after undo clears the future stack", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => result.current.set("c"));
    act(() => result.current.undo());
    expect(result.current.canRedo).toBe(true);
    act(() => result.current.set("d"));
    expect(result.current.current).toBe("d");
    expect(result.current.canRedo).toBe(false);
  });

  it("undo is no-op when past is empty", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.undo());
    expect(result.current.current).toBe("a");
  });

  it("redo is no-op when future is empty", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => result.current.redo());
    expect(result.current.current).toBe("b");
  });

  it("caps past at 50 entries (MAX_HISTORY)", () => {
    const { result } = renderHook(() => useHistory(0));
    act(() => {
      for (let i = 1; i <= 60; i++) result.current.set(i);
    });
    expect(result.current.current).toBe(60);
    expect(result.current.state.past.length).toBeLessThanOrEqual(50);
  });

  it("calls onChange when state mutates after the first render", () => {
    const onChange = vi.fn();
    const { result } = renderHook(() => useHistory("a", { onChange }));
    expect(onChange).not.toHaveBeenCalled();
    act(() => result.current.set("b"));
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange.mock.calls[0][0].present).toBe("b");
  });

  it("Ctrl+Z triggers undo when keydown happens outside text inputs", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true }));
    });
    expect(result.current.current).toBe("a");
  });

  it("Ctrl+Y triggers redo", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => result.current.undo());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "y", ctrlKey: true }));
    });
    expect(result.current.current).toBe("b");
  });

  it("ignores Ctrl+Z keydown originating from input/textarea elements", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));

    const input = document.createElement("input");
    document.body.appendChild(input);
    const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true });
    Object.defineProperty(event, "target", { value: input, writable: false });
    act(() => {
      window.dispatchEvent(event);
    });
    document.body.removeChild(input);

    expect(result.current.current).toBe("b");
  });

  it("Meta+Z triggers undo (macOS metaKey branch)", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", metaKey: true }));
    });
    expect(result.current.current).toBe("a");
  });

  it("Meta+Shift+Z triggers redo (Ctrl+Z+Shift redo branch)", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => result.current.undo());
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "z", ctrlKey: true, shiftKey: true }));
    });
    expect(result.current.current).toBe("b");
  });

  it("unrelated key combo (Ctrl+X) does not trigger undo or redo", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));
    act(() => {
      window.dispatchEvent(new KeyboardEvent("keydown", { key: "x", ctrlKey: true }));
    });
    // State should be unchanged
    expect(result.current.current).toBe("b");
    expect(result.current.canUndo).toBe(true);
  });

  it("ignores Ctrl+Z keydown originating from select elements", () => {
    const { result } = renderHook(() => useHistory("a"));
    act(() => result.current.set("b"));

    const select = document.createElement("select");
    document.body.appendChild(select);
    const event = new KeyboardEvent("keydown", { key: "z", ctrlKey: true, bubbles: true });
    Object.defineProperty(event, "target", { value: select, writable: false });
    act(() => {
      window.dispatchEvent(event);
    });
    document.body.removeChild(select);

    expect(result.current.current).toBe("b");
  });

  describe("reset", () => {
    beforeEach(() => vi.clearAllMocks());

    it("replaces present and pushes previous present onto past", () => {
      const { result } = renderHook(() => useHistory("a"));
      act(() => result.current.reset("z"));
      expect(result.current.current).toBe("z");
      expect(result.current.canUndo).toBe(true);
    });
  });
});
