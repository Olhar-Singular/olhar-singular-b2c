import { describe, it, expect } from "vitest";
import { STATUS_DETAIL_MESSAGES, statusDetailMessage } from "./mpStatusDetail";

describe("statusDetailMessage", () => {
  it("translates the common card rejections to pt-BR", () => {
    expect(statusDetailMessage("cc_rejected_insufficient_amount")).toMatch(/limite|saldo/i);
    expect(statusDetailMessage("cc_rejected_bad_filled_security_code")).toMatch(/código de segurança/i);
    expect(statusDetailMessage("cc_rejected_call_for_authorize")).toMatch(/autoriz/i);
    expect(statusDetailMessage("cc_rejected_card_disabled")).toMatch(/cartão/i);
  });

  it("covers every detail in the table with a non-empty message", () => {
    for (const [detail, message] of Object.entries(STATUS_DETAIL_MESSAGES)) {
      expect(statusDetailMessage(detail)).toBe(message);
      expect(message.length).toBeGreaterThan(10);
    }
  });

  it("falls back to a generic message for unknown, null or undefined details", () => {
    const fallback = statusDetailMessage(undefined);
    expect(fallback).toMatch(/não foi aprovado/i);
    expect(statusDetailMessage(null)).toBe(fallback);
    expect(statusDetailMessage("cc_rejected_something_new")).toBe(fallback);
  });

  it("never contains an em dash (pt-BR punctuation rule)", () => {
    for (const message of Object.values(STATUS_DETAIL_MESSAGES)) {
      expect(message).not.toContain("—");
    }
  });
});
