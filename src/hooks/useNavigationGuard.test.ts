import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { createMemoryRouter, RouterProvider } from "react-router-dom";
import { createElement } from "react";
import { useNavigationGuard } from "./useNavigationGuard";

// useBlocker requires a data router (createMemoryRouter), not plain MemoryRouter.
function withRouter({ children }: { children: React.ReactNode }) {
  const router = createMemoryRouter([{ path: "/", element: createElement(() => children as React.ReactElement) }]);
  return createElement(RouterProvider, { router });
}

describe("useNavigationGuard", () => {
  afterEach(() => vi.restoreAllMocks());

  it("returns unblocked state when shouldBlock is false", () => {
    const { result } = renderHook(() => useNavigationGuard(false), { wrapper: withRouter });
    // React Router v6: useBlocker(false) → "unblocked" (guard inactive).
    expect(result.current.state).toBe("unblocked");
  });

  it("returns non-blocked state when shouldBlock is true but no navigation attempted", () => {
    const { result } = renderHook(() => useNavigationGuard(true), { wrapper: withRouter });
    // Guard is armed; until a navigation is attempted the state is not "blocked".
    expect(["idle", "unblocked"]).toContain(result.current.state);
  });

  it("registers beforeunload listener when shouldBlock is true", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() => useNavigationGuard(true), { wrapper: withRouter });
    expect(spy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("does NOT register beforeunload listener when shouldBlock is false", () => {
    const spy = vi.spyOn(window, "addEventListener");
    renderHook(() => useNavigationGuard(false), { wrapper: withRouter });
    expect(spy).not.toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("removes beforeunload listener when unmounted", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { unmount } = renderHook(() => useNavigationGuard(true), { wrapper: withRouter });
    unmount();
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("removes beforeunload listener when shouldBlock switches to false", () => {
    const removeSpy = vi.spyOn(window, "removeEventListener");
    const { rerender } = renderHook(({ block }) => useNavigationGuard(block), {
      initialProps: { block: true },
      wrapper: withRouter,
    });
    rerender({ block: false });
    expect(removeSpy).toHaveBeenCalledWith("beforeunload", expect.any(Function));
  });

  it("calls e.preventDefault() when beforeunload fires and shouldBlock is true", () => {
    renderHook(() => useNavigationGuard(true), { wrapper: withRouter });
    const event = new Event("beforeunload", { cancelable: true });
    const preventDefaultSpy = vi.spyOn(event, "preventDefault");
    window.dispatchEvent(event);
    expect(preventDefaultSpy).toHaveBeenCalled();
  });
});
