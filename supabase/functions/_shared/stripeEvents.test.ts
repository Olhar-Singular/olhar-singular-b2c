import { describe, it, expect } from "vitest";
import { extractCheckoutGrant, extractCheckoutFailure } from "./stripeEvents";

function completedEvent(session: Record<string, unknown>) {
  return { type: "checkout.session.completed", data: { object: session } };
}

function eventOf(type: string, session: Record<string, unknown>) {
  return { type, data: { object: session } };
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

  it("returns null for an event with no type at all", () => {
    expect(extractCheckoutGrant({ data: { object: { payment_status: "paid" } } })).toBeNull();
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

  // Pix is a delayed-notification method: `completed` arrives unpaid and only the
  // async event confirms the money. Granting on `completed` would hand out free
  // credits to anyone who reaches the QR code screen.
  it("ignores the unpaid completed event that opens a Pix payment", () => {
    expect(
      extractCheckoutGrant(
        completedEvent({
          client_reference_id: "purchase-pix",
          payment_status: "unpaid",
          payment_intent: "pi_pix",
          id: "cs_pix",
        }),
      ),
    ).toBeNull();
  });

  it("grants on the async event that confirms a Pix payment", () => {
    expect(
      extractCheckoutGrant(
        eventOf("checkout.session.async_payment_succeeded", {
          client_reference_id: "purchase-pix",
          payment_status: "paid",
          payment_intent: "pi_pix",
          id: "cs_pix",
        }),
      ),
    ).toEqual({ purchaseId: "purchase-pix", paymentId: "pi_pix" });
  });

  it("returns null for an async success event that is somehow not paid", () => {
    expect(
      extractCheckoutGrant(
        eventOf("checkout.session.async_payment_succeeded", {
          client_reference_id: "purchase-pix",
          payment_status: "unpaid",
          id: "cs_pix",
        }),
      ),
    ).toBeNull();
  });

  it("returns null for a failed async payment", () => {
    expect(
      extractCheckoutGrant(
        eventOf("checkout.session.async_payment_failed", {
          client_reference_id: "purchase-pix",
          payment_status: "unpaid",
          id: "cs_pix",
        }),
      ),
    ).toBeNull();
  });
});

describe("extractCheckoutFailure", () => {
  it("returns the purchase id when a Pix payment fails", () => {
    expect(
      extractCheckoutFailure(
        eventOf("checkout.session.async_payment_failed", {
          client_reference_id: "purchase-pix",
          id: "cs_pix",
        }),
      ),
    ).toEqual({ purchaseId: "purchase-pix" });
  });

  it("returns the purchase id when the session expires unpaid", () => {
    expect(
      extractCheckoutFailure(
        eventOf("checkout.session.expired", {
          client_reference_id: "purchase-pix",
          id: "cs_pix",
        }),
      ),
    ).toEqual({ purchaseId: "purchase-pix" });
  });

  it("returns null for a successful checkout", () => {
    expect(
      extractCheckoutFailure(
        completedEvent({ client_reference_id: "p1", payment_status: "paid", id: "cs_1" }),
      ),
    ).toBeNull();
  });

  it("returns null for an event with no type at all", () => {
    expect(extractCheckoutFailure({ data: { object: { client_reference_id: "p1" } } })).toBeNull();
  });

  it("returns null when the event carries no session object", () => {
    expect(extractCheckoutFailure({ type: "checkout.session.expired" })).toBeNull();
  });

  it("returns null when client_reference_id is missing", () => {
    expect(
      extractCheckoutFailure(eventOf("checkout.session.expired", { id: "cs_1" })),
    ).toBeNull();
  });
});
