import { describe, it, expect } from "vitest";
import { formatUsd, formatLastAccess, userDisplayName } from "./adminFormat";

describe("userDisplayName", () => {
  it("prefers full name, then email, then a fallback", () => {
    expect(userDisplayName({ full_name: "Alice", email: "a@x.com" })).toBe("Alice");
    expect(userDisplayName({ full_name: null, email: "a@x.com" })).toBe("a@x.com");
    expect(userDisplayName({ full_name: null, email: null })).toBe("Este usuário");
  });
});

describe("formatUsd", () => {
  it("formats whole and decimal dollar amounts", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(5)).toBe("$5.00");
    expect(formatUsd(1234.5)).toBe("$1,234.50");
  });

  it("keeps small AI costs readable with up to 4 decimals", () => {
    expect(formatUsd(0.0123)).toBe("$0.0123");
    expect(formatUsd(0.1)).toBe("$0.10");
  });

  it("falls back to $0.00 for non-finite values", () => {
    expect(formatUsd(Number.NaN)).toBe("$0.00");
    expect(formatUsd(Number.POSITIVE_INFINITY)).toBe("$0.00");
  });
});

describe("formatLastAccess", () => {
  const now = new Date("2026-06-01T12:00:00Z");

  it("returns 'Nunca' when there is no timestamp", () => {
    expect(formatLastAccess(null, now)).toBe("Nunca");
    expect(formatLastAccess(undefined, now)).toBe("Nunca");
  });

  it("returns 'Nunca' for an unparseable timestamp", () => {
    expect(formatLastAccess("not-a-date", now)).toBe("Nunca");
  });

  it("returns a pt-BR relative distance with suffix", () => {
    expect(formatLastAccess("2026-05-30T12:00:00Z", now)).toBe("há 2 dias");
  });
});
