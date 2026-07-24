import { describe, it, expect } from "vitest";
import {
  interpretReservation,
  reservationErrorResponse,
  resolveRequestId,
} from "./creditReservation";

/**
 * CRASH-SAFE CHARGING.
 *
 * open_adapt_reservation reserves and charges in one transaction and returns a
 * jsonb payload. These are the pure decisions the edge function makes from it —
 * the money itself is exercised by pgTAP (credit_reservations.test.sql), not by
 * mocks, because only the real database can prove atomicity and idempotency.
 */
describe("interpretReservation", () => {
  it("reads the free-first outcome", () => {
    expect(interpretReservation({ success: true, mode: "free", credits_charged: 0 })).toEqual({
      status: "free",
      creditsCharged: 0,
    });
  });

  it("reads a charged outcome with the new balance", () => {
    expect(
      interpretReservation({
        success: true,
        mode: "charged",
        credits_charged: 12,
        new_balance: 88,
      }),
    ).toEqual({ status: "charged", creditsCharged: 12, newBalance: 88 });
  });

  it("defaults a missing new_balance to 0", () => {
    expect(
      interpretReservation({ success: true, mode: "charged", credits_charged: 12 }),
    ).toEqual({ status: "charged", creditsCharged: 12, newBalance: 0 });
  });

  it("defaults a missing credits_charged to 0", () => {
    expect(interpretReservation({ success: true, mode: "charged", new_balance: 5 })).toEqual({
      status: "charged",
      creditsCharged: 0,
      newBalance: 5,
    });
  });

  it("surfaces a replayed request as 'duplicate' rather than a generic error", () => {
    // The request was already charged once; charging again would double-bill.
    expect(interpretReservation({ success: false, error: "duplicate_request" })).toEqual({
      status: "duplicate",
    });
  });

  it("surfaces insufficient credits with the echoed balance", () => {
    expect(
      interpretReservation({ success: false, error: "insufficient_credits", balance: 3 }),
    ).toEqual({ status: "insufficient", balance: 3 });
  });

  it("tolerates insufficient credits without a balance", () => {
    expect(interpretReservation({ success: false, error: "insufficient_credits" })).toEqual({
      status: "insufficient",
      balance: null,
    });
  });

  it("treats any other unsuccessful payload as an error", () => {
    expect(interpretReservation({ success: false, error: "user_not_found" })).toEqual({
      status: "error",
    });
  });

  it("treats a null payload as an error (never as a free pass)", () => {
    expect(interpretReservation(null)).toEqual({ status: "error" });
  });

  it("treats an unknown mode as an error rather than assuming it was free", () => {
    expect(interpretReservation({ success: true, mode: undefined })).toEqual({ status: "error" });
  });
});

describe("reservationErrorResponse", () => {
  it("maps insufficient credits to 402 with the balance and cost", () => {
    expect(reservationErrorResponse({ status: "insufficient", balance: 3 }, 12)).toEqual({
      status: 402,
      body: { error: "Créditos insuficientes.", balance: 3, required: 12 },
    });
  });

  it("maps a replay to 409 so the client can tell it apart from a failure", () => {
    expect(reservationErrorResponse({ status: "duplicate" }, 12)).toEqual({
      status: 409,
      body: { error: "Esta geração já foi processada." },
    });
  });

  it("maps an error to a generic 500", () => {
    expect(reservationErrorResponse({ status: "error" }, 12)).toEqual({
      status: 500,
      body: { error: "Erro ao processar créditos." },
    });
  });

  it("returns null for free and charged so the caller proceeds", () => {
    expect(reservationErrorResponse({ status: "free", creditsCharged: 0 }, 12)).toBeNull();
    expect(
      reservationErrorResponse({ status: "charged", creditsCharged: 12, newBalance: 88 }, 12),
    ).toBeNull();
  });
});

describe("resolveRequestId", () => {
  it("accepts a uuid sent by the client (the idempotency key)", () => {
    const id = "AA000000-0000-4000-8000-000000000001";
    expect(resolveRequestId(id, () => "generated")).toEqual({
      ok: true,
      id: "aa000000-0000-4000-8000-000000000001",
    });
  });

  it("generates one when the client sends nothing (older clients still get crash safety)", () => {
    expect(resolveRequestId(undefined, () => "generated")).toEqual({ ok: true, id: "generated" });
    expect(resolveRequestId(null, () => "generated")).toEqual({ ok: true, id: "generated" });
  });

  it("rejects a malformed id instead of silently generating one", () => {
    // Silently replacing it would destroy the caller's replay protection.
    expect(resolveRequestId("not-a-uuid", () => "generated")).toEqual({ ok: false });
    expect(resolveRequestId(42, () => "generated")).toEqual({ ok: false });
    expect(resolveRequestId("", () => "generated")).toEqual({ ok: false });
  });
});
