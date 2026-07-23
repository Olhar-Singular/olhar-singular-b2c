import { describe, it, expect } from "vitest";
import { ALLOWED_PACKAGES, TEST_PACKAGE, findPackage } from "./creditPackages";

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

describe("TEST_PACKAGE (super-admin only)", () => {
  it("is 1 credit for R$1.00 and stays out of ALLOWED_PACKAGES", () => {
    expect(TEST_PACKAGE).toEqual({ credits: 1, amountBrl: 1.0 });
    expect(ALLOWED_PACKAGES).not.toContainEqual(TEST_PACKAGE);
  });

  it("is rejected by findPackage without options", () => {
    expect(findPackage(1, 1.0)).toBeNull();
  });

  it("is rejected by findPackage when allowTest is false", () => {
    expect(findPackage(1, 1.0, { allowTest: false })).toBeNull();
  });

  it("matches when allowTest is true", () => {
    expect(findPackage(1, 1.0, { allowTest: true })).toEqual(TEST_PACKAGE);
  });

  it("tolerates floating-point drift under one cent when allowed", () => {
    expect(findPackage(1, 1.001, { allowTest: true })).toEqual(TEST_PACKAGE);
  });

  it("keeps matching the regular packages when allowTest is true", () => {
    expect(findPackage(120, 29.9, { allowTest: true })).toEqual({ credits: 120, amountBrl: 29.9 });
  });
});
