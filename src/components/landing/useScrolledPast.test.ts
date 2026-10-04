import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook, fireEvent, act } from "@testing-library/react";
import { useScrolledPast } from "./useScrolledPast";

function setViewport(scrollY: number, innerHeight = 1000) {
  Object.defineProperty(window, "scrollY", { value: scrollY, configurable: true, writable: true });
  Object.defineProperty(window, "innerHeight", { value: innerHeight, configurable: true, writable: true });
}

function scrollTo(scrollY: number) {
  setViewport(scrollY, window.innerHeight);
  act(() => {
    fireEvent.scroll(window);
  });
}

describe("useScrolledPast", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("is false at the top of the page", () => {
    setViewport(0);
    const { result } = renderHook(() => useScrolledPast());
    expect(result.current).toBe(false);
  });

  it("computes the initial state on mount when the page is already scrolled", () => {
    setViewport(1000);
    const { result } = renderHook(() => useScrolledPast());
    expect(result.current).toBe(true);
  });

  it("turns true after scrolling past 90% of the viewport and back to false", () => {
    setViewport(0);
    const { result } = renderHook(() => useScrolledPast());
    scrollTo(1000);
    expect(result.current).toBe(true);
    scrollTo(0);
    expect(result.current).toBe(false);
  });

  it("is strictly greater than the threshold (exactly 90% stays false)", () => {
    setViewport(0);
    const { result } = renderHook(() => useScrolledPast());
    scrollTo(900);
    expect(result.current).toBe(false);
    scrollTo(901);
    expect(result.current).toBe(true);
  });

  it("respects a custom ratio", () => {
    setViewport(0);
    const { result } = renderHook(() => useScrolledPast(0.25));
    scrollTo(200);
    expect(result.current).toBe(false);
    scrollTo(300);
    expect(result.current).toBe(true);
  });

  it("registers a passive scroll listener and removes it on unmount", () => {
    setViewport(0);
    const add = vi.spyOn(window, "addEventListener");
    const remove = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useScrolledPast());

    const added = add.mock.calls.find(([type]) => type === "scroll");
    expect(added).toBeDefined();
    expect(added?.[2]).toEqual({ passive: true });

    unmount();
    const removed = remove.mock.calls.find(([type]) => type === "scroll");
    expect(removed?.[1]).toBe(added?.[1]);
  });
});
