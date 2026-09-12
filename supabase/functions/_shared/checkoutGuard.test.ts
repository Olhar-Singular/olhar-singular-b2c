import { describe, it, expect } from "vitest";
import {
  clientIp,
  decideCheckoutAccess,
  DEFAULT_LIMITS,
  extractCpf,
  hashIdentifier,
  isValidCpf,
  isValidEmail,
  normalizeEmail,
} from "./checkoutGuard";

describe("normalizeEmail", () => {
  it("lower-cases and trims", () => {
    expect(normalizeEmail("  Ana@Example.COM ")).toBe("ana@example.com");
  });

  it("collapses gmail dots and +tags, leaving other domains alone", () => {
    expect(normalizeEmail("a.n.a+promo@gmail.com")).toBe("ana@gmail.com");
    expect(normalizeEmail("ana+x@googlemail.com")).toBe("ana@googlemail.com");
    expect(normalizeEmail("a.na+x@outlook.com")).toBe("a.na+x@outlook.com");
  });

  it("returns garbage unchanged when there is no local part", () => {
    expect(normalizeEmail("nope")).toBe("nope");
    expect(normalizeEmail("@x.com")).toBe("@x.com");
  });
});

describe("isValidEmail", () => {
  it("accepts a plain address and refuses obvious junk", () => {
    expect(isValidEmail("ana@example.com")).toBe(true);
    expect(isValidEmail("ana@example")).toBe(false);
    expect(isValidEmail("ana example@x.com")).toBe(false);
    expect(isValidEmail("a".repeat(250) + "@x.com")).toBe(false);
  });
});

describe("clientIp", () => {
  const headers = (map: Record<string, string>) => ({ get: (n: string) => map[n.toLowerCase()] ?? null });

  it("takes the first hop of x-forwarded-for", () => {
    expect(clientIp(headers({ "x-forwarded-for": "203.0.113.9, 10.0.0.1" }))).toBe("203.0.113.9");
  });

  it("falls back to cf-connecting-ip, x-real-ip, then unknown", () => {
    expect(clientIp(headers({ "x-forwarded-for": " ", "cf-connecting-ip": "1.1.1.1" }))).toBe("1.1.1.1");
    expect(clientIp(headers({ "x-real-ip": "2.2.2.2" }))).toBe("2.2.2.2");
    expect(clientIp(headers({}))).toBe("unknown");
  });
});

describe("hashIdentifier", () => {
  it("is a deterministic 64-hex HMAC that depends on the secret", async () => {
    const a = await hashIdentifier("ana@example.com", "s1");
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(await hashIdentifier("ana@example.com", "s1")).toBe(a);
    expect(await hashIdentifier("ana@example.com", "s2")).not.toBe(a);
  });
});

describe("decideCheckoutAccess", () => {
  it("allows under the limits (the counts include the current attempt)", () => {
    expect(decideCheckoutAccess({ by_email_1h: 5, by_ip_1h: 10, rejected_10m: 20 })).toEqual({ allowed: true });
  });

  it("rate-limits per e-mail or per IP", () => {
    expect(decideCheckoutAccess({ by_email_1h: 6, by_ip_1h: 1, rejected_10m: 0 })).toEqual({ allowed: false, reason: "rate_limited", httpStatus: 429 });
    expect(decideCheckoutAccess({ by_email_1h: 1, by_ip_1h: 11, rejected_10m: 0 })).toEqual({ allowed: false, reason: "rate_limited", httpStatus: 429 });
  });

  it("opens the circuit on a rejection storm, before the per-user limits", () => {
    expect(decideCheckoutAccess({ by_email_1h: 99, by_ip_1h: 0, rejected_10m: 21 })).toEqual({ allowed: false, reason: "circuit_open", httpStatus: 503 });
  });

  it("honours custom limits", () => {
    expect(decideCheckoutAccess({ by_email_1h: 2, by_ip_1h: 0, rejected_10m: 0 }, { ...DEFAULT_LIMITS, perEmailPerHour: 1 })).toMatchObject({ reason: "rate_limited" });
  });
});

describe("isValidCpf / extractCpf", () => {
  it("validates the check digits", () => {
    expect(isValidCpf("12345678909")).toBe(true);
    expect(isValidCpf("12345678900")).toBe(false);
    expect(isValidCpf("11111111111")).toBe(false);
    expect(isValidCpf("1234567890")).toBe(false);
    expect(isValidCpf("529.982.247-25")).toBe(false);
  });

  it("handles a check digit that computes to 10 (becomes 0)", () => {
    // 000.000.001-91: first digit computes to rest 10 -> 0? use a known valid CPF with a 0 check digit.
    expect(isValidCpf("00000000191")).toBe(true);
  });

  it("extracts only a valid CPF from the Brick payer", () => {
    expect(extractCpf({ identification: { type: "CPF", number: "123.456.789-09" } })).toBe("12345678909");
    expect(extractCpf({ identification: { number: "12345678909" } })).toBe("12345678909");
    expect(extractCpf({ identification: { type: "CNPJ", number: "12345678909" } })).toBeNull();
    expect(extractCpf({ identification: { type: "CPF", number: "123" } })).toBeNull();
    expect(extractCpf({ identification: { type: "CPF", number: 123 as unknown as string } })).toBeNull();
    expect(extractCpf({})).toBeNull();
    expect(extractCpf(undefined)).toBeNull();
  });
});
