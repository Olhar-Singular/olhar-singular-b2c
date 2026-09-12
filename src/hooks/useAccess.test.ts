import { renderHook } from "@testing-library/react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAccess } from "./useAccess";

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
});
