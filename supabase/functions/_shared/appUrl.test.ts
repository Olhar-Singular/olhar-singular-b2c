import { describe, it, expect } from "vitest";
import { DEFAULT_APP_URL, normalizeAppUrl } from "./appUrl";

describe("normalizeAppUrl", () => {
  it("strips trailing slashes and surrounding whitespace so links never get a double slash", () => {
    expect(normalizeAppUrl("https://professor.olharsingular.com/")).toBe("https://professor.olharsingular.com");
    expect(normalizeAppUrl("https://professor.olharsingular.com///")).toBe("https://professor.olharsingular.com");
    expect(normalizeAppUrl(" https://professor.olharsingular.com \n")).toBe("https://professor.olharsingular.com");
    expect(normalizeAppUrl("https://professor.olharsingular.com")).toBe("https://professor.olharsingular.com");
  });

  it("falls back to the local dev URL when APP_URL is missing or blank", () => {
    expect(normalizeAppUrl(undefined)).toBe(DEFAULT_APP_URL);
    expect(normalizeAppUrl("")).toBe(DEFAULT_APP_URL);
    expect(normalizeAppUrl("   ")).toBe(DEFAULT_APP_URL);
    expect(normalizeAppUrl("/")).toBe(DEFAULT_APP_URL);
    expect(DEFAULT_APP_URL).toBe("http://localhost:8080");
  });
});
