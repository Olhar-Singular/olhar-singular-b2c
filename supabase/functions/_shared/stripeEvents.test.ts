import { describe, it, expect } from "vitest";
import { extractCheckoutGrant } from "./stripeEvents";

function completedEvent(session: Record<string, unknown>) {
  return { type: "checkout.session.completed", data: { object: session } };
}

describe("extractCheckoutGrant", () => {
  it("returns purchaseId and payment_intent for a paid completed session", () => {
    const grant = extractCheckoutGrant(
      completedEvent({
        client_reference_id: "purchase-1",
        payment_status: "paid",
        payment_intent: "pi_123",
        id: "cs_123",
      }),
    );
    expect(grant).toEqual({ purchaseId: "purchase-1", paymentId: "pi_123" });
  });

  it("falls back to the session id when payment_intent is absent", () => {
    const grant = extractCheckoutGrant(
      completedEvent({
        client_reference_id: "purchase-1",
        payment_status: "paid",
        payment_intent: null,
        id: "cs_123",
      }),
    );
    expect(grant).toEqual({ purchaseId: "purchase-1", paymentId: "cs_123" });
  });

  it("returns null for a non-checkout event type", () => {
    expect(
      extractCheckoutGrant({
        type: "payment_intent.succeeded",
        data: { object: { client_reference_id: "p1", payment_status: "paid", id: "x" } },
      }),
    ).toBeNull();
  });

  it("returns null when the event carries no session object", () => {
    expect(extractCheckoutGrant({ type: "checkout.session.completed" })).toBeNull();
  });

  it("returns null when the session is not paid", () => {
    expect(
      extractCheckoutGrant(
        completedEvent({ client_reference_id: "p1", payment_status: "unpaid", id: "cs_1" }),
      ),
    ).toBeNull();
  });

  it("returns null when client_reference_id is missing", () => {
    expect(
      extractCheckoutGrant(
        completedEvent({ payment_status: "paid", payment_intent: "pi_1", id: "cs_1" }),
      ),
    ).toBeNull();
  });

  it("returns null when neither payment_intent nor id is present", () => {
    expect(
      extractCheckoutGrant(
        completedEvent({ client_reference_id: "p1", payment_status: "paid" }),
      ),
    ).toBeNull();
  });
});
