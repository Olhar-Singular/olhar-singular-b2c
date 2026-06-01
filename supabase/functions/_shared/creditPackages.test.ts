import { describe, it, expect } from "vitest";
import { ALLOWED_PACKAGES, findPackage } from "./creditPackages";

describe("ALLOWED_PACKAGES", () => {
  it("exposes the three credit packages with their BRL prices", () => {
    expect(ALLOWED_PACKAGES).toEqual([
      { credits: 30, amountBrl: 9.9 },
      { credits: 120, amountBrl: 29.9 },
      { credits: 300, amountBrl: 59.9 },
    ]);
  });
});

describe("findPackage", () => {
  it("returns the package when credits and amount match", () => {
    expect(findPackage(120, 29.9)).toEqual({ credits: 120, amountBrl: 29.9 });
  });

  it("matches every allowed package", () => {
    expect(findPackage(30, 9.9)).toEqual({ credits: 30, amountBrl: 9.9 });
    expect(findPackage(300, 59.9)).toEqual({ credits: 300, amountBrl: 59.9 });
  });

  it("tolerates floating-point drift under one cent", () => {
    expect(findPackage(30, 9.901)).toEqual({ credits: 30, amountBrl: 9.9 });
  });

  it("returns null when the credits amount is unknown", () => {
    expect(findPackage(999, 9.9)).toBeNull();
  });

  it("returns null when the price does not match the credits", () => {
    expect(findPackage(30, 59.9)).toBeNull();
  });

  it("returns null when amountBrl is undefined", () => {
    expect(findPackage(30, undefined)).toBeNull();
  });

  it("returns null when credits is undefined", () => {
    expect(findPackage(undefined, 9.9)).toBeNull();
  });
});
