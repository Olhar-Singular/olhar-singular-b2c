import { describe, it, expect } from "vitest";
import { parseCancelInput, parseSubscribeInput, parseUpdateCardInput } from "./subscribeInput";

const CARD = { token: "tok", payment_method_id: "visa", payer: { email: "a@b.c" } };

describe("parseSubscribeInput", () => {
  it("accepts a plan slug, a Brick card and the optional last four digits and attribution", () => {
    expect(parseSubscribeInput({ planSlug: "profissional", card: CARD, cardLastFour: "1234", attribution: { utm_source: "x" } })).toEqual({
      ok: true,
      planSlug: "profissional",
      card: CARD,
      cardLastFour: "1234",
      attribution: { utm_source: "x" },
    });
  });

  it("defaults the optional fields", () => {
    expect(parseSubscribeInput({ planSlug: "basico", card: CARD })).toEqual({
      ok: true,
      planSlug: "basico",
      card: CARD,
      cardLastFour: null,
      attribution: undefined,
    });
  });

  it("rejects a non-object body", () => {
    expect(parseSubscribeInput(null)).toEqual({ ok: false, error: "invalid_body" });
  });

  it("rejects a missing or malformed plan slug", () => {
    expect(parseSubscribeInput({ card: CARD })).toEqual({ ok: false, error: "invalid_plan" });
    expect(parseSubscribeInput({ planSlug: "Pro Fissional!", card: CARD })).toEqual({ ok: false, error: "invalid_plan" });
  });

  it("surfaces the card parser's error", () => {
    expect(parseSubscribeInput({ planSlug: "basico", card: { token: "" } })).toEqual({ ok: false, error: "invalid_card" });
    expect(parseSubscribeInput({ planSlug: "basico", card: { ...CARD, installments: 2 } })).toEqual({ ok: false, error: "installments_not_allowed" });
  });

  it("ignores a last-four that is not four digits and an attribution that is not an object", () => {
    expect(parseSubscribeInput({ planSlug: "basico", card: CARD, cardLastFour: "12a4", attribution: "meta" })).toEqual({
      ok: true,
      planSlug: "basico",
      card: CARD,
      cardLastFour: null,
      attribution: undefined,
    });
  });
});

describe("parseUpdateCardInput", () => {
  it("accepts the Brick card with an optional last four", () => {
    expect(parseUpdateCardInput({ card: CARD, cardLastFour: "4321" })).toMatchObject({ ok: true, cardLastFour: "4321" });
    expect(parseUpdateCardInput({ card: CARD, cardLastFour: "12" })).toMatchObject({ ok: true, cardLastFour: null });
    expect(parseUpdateCardInput({ card: CARD })).toMatchObject({ ok: true, cardLastFour: null });
  });

  it("rejects a missing body or card", () => {
    expect(parseUpdateCardInput(null)).toEqual({ ok: false, error: "invalid_body" });
    expect(parseUpdateCardInput("x")).toEqual({ ok: false, error: "invalid_body" });
    expect(parseUpdateCardInput({})).toEqual({ ok: false, error: "invalid_card" });
    expect(parseUpdateCardInput({ card: { ...CARD, installments: 3 } })).toEqual({ ok: false, error: "installments_not_allowed" });
  });
});

describe("parseCancelInput", () => {
  const ID = "0F6A2C2E-6D7B-4D0E-9A4B-1C2D3E4F5A6B";

  it("defaults to the caller when there is no body or userId", () => {
    expect(parseCancelInput(null)).toEqual({ ok: true, userId: null });
    expect(parseCancelInput(undefined)).toEqual({ ok: true, userId: null });
    expect(parseCancelInput({})).toEqual({ ok: true, userId: null });
    expect(parseCancelInput({ userId: null })).toEqual({ ok: true, userId: null });
  });

  it("normalises a target user uuid", () => {
    expect(parseCancelInput({ userId: ID })).toEqual({ ok: true, userId: ID.toLowerCase() });
  });

  it("rejects a non-object body or a malformed userId", () => {
    expect(parseCancelInput("x")).toEqual({ ok: false, error: "invalid_body" });
    expect(parseCancelInput({ userId: "someone" })).toEqual({ ok: false, error: "invalid_body" });
    expect(parseCancelInput({ userId: 12 })).toEqual({ ok: false, error: "invalid_body" });
  });
});
