import { describe, it, expect } from "vitest";
import { authorizeCron } from "./cronAuth";

const SECRET = "s3cr3t-cron-token-0123456789";

describe("authorizeCron", () => {
  it("accepts the exact bearer secret", () => {
    expect(authorizeCron(`Bearer ${SECRET}`, SECRET)).toBe("ok");
    expect(authorizeCron(`Bearer ${SECRET} `, ` ${SECRET}\n`)).toBe("ok");
  });

  it("refuses a wrong, truncated, extended or differently-cased token", () => {
    expect(authorizeCron(`Bearer ${SECRET.slice(0, -1)}`, SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Bearer ${SECRET}x`, SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Bearer ${SECRET.toUpperCase()}`, SECRET)).toBe("unauthorized");
    expect(authorizeCron("Bearer ", SECRET)).toBe("unauthorized");
  });

  it("refuses a missing or non-bearer header", () => {
    expect(authorizeCron(null, SECRET)).toBe("unauthorized");
    expect(authorizeCron("", SECRET)).toBe("unauthorized");
    expect(authorizeCron(SECRET, SECRET)).toBe("unauthorized");
    expect(authorizeCron(`Basic ${SECRET}`, SECRET)).toBe("unauthorized");
  });

  it("reports a missing or blank secret as misconfigured, whatever the header", () => {
    expect(authorizeCron(`Bearer ${SECRET}`, undefined)).toBe("misconfigured");
    expect(authorizeCron(`Bearer ${SECRET}`, "")).toBe("misconfigured");
    expect(authorizeCron(`Bearer `, "   ")).toBe("misconfigured");
    expect(authorizeCron(null, undefined)).toBe("misconfigured");
  });
});
