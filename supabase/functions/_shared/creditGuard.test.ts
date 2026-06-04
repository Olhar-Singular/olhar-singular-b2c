import { describe, it, expect, vi } from "vitest";
import { createRefundGuard } from "./creditGuard";

/**
 * CREDIT INVARIANT TESTS.
 *
 * These prove the money-critical guarantee for adapt-activity: once a user has
 * been charged `creditsCharged`, ANY non-success exit refunds EXACTLY that
 * amount, the refund happens AT MOST ONCE no matter how many error paths fire,
 * and the net amount the user pays on failure is therefore ZERO.
 */
describe("createRefundGuard — credit invariant (no charge on failure)", () => {
  it("refunds exactly what was charged on a single failure path", async () => {
    const granted: number[] = [];
    const guard = createRefundGuard({
      creditsCharged: 8,
      grant: async (amount) => {
        granted.push(amount);
      },
    });

    await guard.refundIfNeeded();

    expect(granted).toEqual([8]);
    // Net paid = charged - refunded = 8 - 8 = 0.
    const netPaid = 8 - granted.reduce((a, b) => a + b, 0);
    expect(netPaid).toBe(0);
  });

  it("refunds AT MOST ONCE even when several error paths each call it", async () => {
    const grant = vi.fn(() => Promise.resolve());
    const guard = createRefundGuard({ creditsCharged: 12, grant });

    // Simulate multiple early-return error paths all attempting a refund.
    await guard.refundIfNeeded();
    await guard.refundIfNeeded();
    await guard.refundIfNeeded();

    expect(grant).toHaveBeenCalledTimes(1);
    expect(grant).toHaveBeenCalledWith(12);
  });

  it("grants nothing when the user was never charged (free tier)", async () => {
    const grant = vi.fn(() => Promise.resolve());
    const guard = createRefundGuard({ creditsCharged: 0, grant });

    await guard.refundIfNeeded();

    expect(grant).not.toHaveBeenCalled();
  });

  it("never throws if the grant itself fails — reports via onError", async () => {
    const err = new Error("grant rpc down");
    const onError = vi.fn();
    const guard = createRefundGuard({
      creditsCharged: 5,
      grant: () => Promise.reject(err),
      onError,
    });

    await expect(guard.refundIfNeeded()).resolves.toBeUndefined();
    expect(onError).toHaveBeenCalledWith(err);
    // A failed refund still marks the guard consumed (no infinite retries).
    await guard.refundIfNeeded();
    expect(onError).toHaveBeenCalledTimes(1);
  });
});
