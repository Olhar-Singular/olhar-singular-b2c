import { useEffect } from "react";
import { useBlocker } from "react-router-dom";

/**
 * Blocks in-app navigation (React Router) and browser-level navigation
 * (tab close / URL change) while `shouldBlock` is true.
 *
 * Returns the blocker object so callers can render a confirmation dialog
 * when `blocker.state === "blocked"`.
 */
export function useNavigationGuard(shouldBlock: boolean) {
  const blocker = useBlocker(shouldBlock);

  // Block browser-level navigation (tab close, address-bar change, F5).
  useEffect(() => {
    if (!shouldBlock) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [shouldBlock]);

  return blocker;
}
