import { describe, it, expect } from "vitest";
import { parseSubscribeInput } from "./subscribeInput";

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
