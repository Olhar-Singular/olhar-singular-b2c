import { describe, it, expect } from "vitest";
import { selectPackage, toCreditPackage, type CreditPackageRow } from "./creditPackages";

const ROWS: CreditPackageRow[] = [
  { id: "pkg-basic", credits: 30, price_brl: 9.9, label: "Básico", active: true, admin_only: false },
  // PostgREST serializes numeric columns as strings; the mapper must cope.
  { id: "pkg-pro", credits: 120, price_brl: "29.90", label: "Profissional", active: true, admin_only: false },
  { id: "pkg-max", credits: 300, price_brl: 59.9, label: "Avançado", active: true, admin_only: false },
  { id: "pkg-old", credits: 999, price_brl: 999, label: "Descontinuado", active: false, admin_only: false },
  { id: "pkg-test", credits: 1, price_brl: 1, label: "Teste (admin)", active: true, admin_only: true },
];

describe("toCreditPackage", () => {
  it("maps a table row to the package shape the checkouts use", () => {
    expect(toCreditPackage(ROWS[0])).toEqual({
      id: "pkg-basic",
      credits: 30,
      amountBrl: 9.9,
      label: "Básico",
      adminOnly: false,
    });
  });

  it("parses a numeric price that arrived as a string", () => {
    expect(toCreditPackage(ROWS[1]).amountBrl).toBe(29.9);
  });
});

describe("selectPackage", () => {
  it("returns the active public package with the given id", () => {
    expect(selectPackage(ROWS, "pkg-pro")).toEqual({
      id: "pkg-pro",
      credits: 120,
      amountBrl: 29.9,
      label: "Profissional",
      adminOnly: false,
    });
  });

  it("returns null for an unknown id", () => {
    expect(selectPackage(ROWS, "pkg-nope")).toBeNull();
  });

  it("returns null when the id is not a string", () => {
    expect(selectPackage(ROWS, 42)).toBeNull();
    expect(selectPackage(ROWS, undefined)).toBeNull();
    expect(selectPackage(ROWS, null)).toBeNull();
  });

  it("never sells an inactive package, even by id", () => {
    expect(selectPackage(ROWS, "pkg-old")).toBeNull();
  });

  it("hides the admin-only smoke package from regular buyers", () => {
    expect(selectPackage(ROWS, "pkg-test")).toBeNull();
    expect(selectPackage(ROWS, "pkg-test", { allowAdminOnly: false })).toBeNull();
  });

  it("sells the admin-only smoke package to a super-admin", () => {
    expect(selectPackage(ROWS, "pkg-test", { allowAdminOnly: true })).toEqual({
      id: "pkg-test",
      credits: 1,
      amountBrl: 1,
      label: "Teste (admin)",
      adminOnly: true,
    });
  });

  it("keeps selling regular packages to a super-admin", () => {
    expect(selectPackage(ROWS, "pkg-basic", { allowAdminOnly: true })?.credits).toBe(30);
  });
});
