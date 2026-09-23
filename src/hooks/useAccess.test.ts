import { act, renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { ACCESS_CLOCK_MS, useAccess } from "./useAccess";

vi.mock("@/hooks/useAuth", () => ({ useAuth: vi.fn() }));

import { useAuth } from "@/hooks/useAuth";

describe("useAccess", () => {
  beforeEach(() => vi.clearAllMocks());

  it("is null while the profile has not loaded", () => {
    vi.mocked(useAuth).mockReturnValue({ profile: null } as never);
    const { result } = renderHook(() => useAccess());
    expect(result.current).toBeNull();
  });

  it("derives the access state from the profile", () => {
    vi.mocked(useAuth).mockReturnValue({
      profile: {
        access_kind: "legacy",
        plan_credits: 0,
        plan_period_end: null,
        credit_balance: 7,
        trial_started_at: null,
        must_set_password: false,
      },
    } as never);
    const { result } = renderHook(() => useAccess());
    expect(result.current).toMatchObject({ kind: "legacy", total: 7, paywalled: false });
  });

  describe("clock", () => {
    beforeEach(() => vi.useFakeTimers());
    afterEach(() => vi.useRealTimers());

    it("notices a trial ending while the tab stays open", () => {
      const start = new Date("2026-09-14T11:59:30Z");
      vi.setSystemTime(start);
      vi.mocked(useAuth).mockReturnValue({
        profile: {
          access_kind: "trial",
          plan_credits: 20,
          plan_period_end: "2026-09-14T12:00:00Z",
          credit_balance: 0,
          trial_started_at: "2026-09-07T12:00:00Z",
          must_set_password: false,
        },
      } as never);
      const { result, unmount } = renderHook(() => useAccess());
      expect(result.current).toMatchObject({ planCredits: 20, trialExpired: false, paywalled: false });

      act(() => {
        vi.advanceTimersByTime(ACCESS_CLOCK_MS);
      });
      expect(result.current).toMatchObject({ planCredits: 0, trialExpired: true, paywalled: true });
      unmount();
    });
  });
});
