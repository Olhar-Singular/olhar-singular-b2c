import { describe, it, expect } from "vitest";
import {
  BARRIER_COMPLEXITY,
  ADAPTATION_CREDITS,
  getComplexityTier,
  calcAdaptationCost,
} from "./adaptationCost";

// The frontend is the canonical product source; the edge function must mirror it.
import * as frontend from "../../../src/lib/domain/barriers";

describe("getComplexityTier", () => {
  it("defaults to medium when no dimensions are given", () => {
    expect(getComplexityTier([])).toBe("medium");
  });

  it("returns the tier of a single low-complexity barrier", () => {
    expect(getComplexityTier(["dislexia"])).toBe("low");
  });

  it("returns the tier of a single medium-complexity barrier", () => {
    expect(getComplexityTier(["tdah"])).toBe("medium");
  });

  it("returns the tier of a single high-complexity barrier", () => {
    expect(getComplexityTier(["tea"])).toBe("high");
  });

  it("escalates to high when any barrier is high", () => {
    expect(getComplexityTier(["dislexia", "tea"])).toBe("high");
  });

  it("escalates to medium when the max is medium", () => {
    expect(getComplexityTier(["dislexia", "tdah"])).toBe("medium");
  });

  it("stays low when all barriers are low", () => {
    expect(getComplexityTier(["dislexia", "discalculia", "disgrafia"])).toBe("low");
  });

  it("treats unknown dimensions as medium", () => {
    expect(getComplexityTier(["unknown_thing"])).toBe("medium");
    expect(getComplexityTier(["dislexia", "unknown_thing"])).toBe("medium");
  });
});

describe("calcAdaptationCost", () => {
  it("charges the medium price for no dimensions", () => {
    expect(calcAdaptationCost([])).toBe(ADAPTATION_CREDITS.medium);
  });

  it("charges the low price for low-tier barriers", () => {
    expect(calcAdaptationCost(["dislexia"])).toBe(ADAPTATION_CREDITS.low);
  });

  it("charges the medium price for medium-tier barriers", () => {
    expect(calcAdaptationCost(["tdah"])).toBe(ADAPTATION_CREDITS.medium);
  });

  it("charges the high price for high-tier barriers", () => {
    expect(calcAdaptationCost(["tea"])).toBe(ADAPTATION_CREDITS.high);
  });
});

// SSOT guard: the edge function cost tables must NEVER diverge from the
// frontend product source (src/lib/domain/barriers.ts). If anyone edits one
// without the other, this test fails.
describe("cost tables stay in sync with the frontend", () => {
  it("BARRIER_COMPLEXITY matches the frontend table exactly", () => {
    expect(BARRIER_COMPLEXITY).toEqual(frontend.BARRIER_COMPLEXITY);
  });

  it("ADAPTATION_CREDITS matches the frontend table exactly", () => {
    expect(ADAPTATION_CREDITS).toEqual(frontend.ADAPTATION_CREDITS);
  });

  it("computes the same cost as the frontend across every known dimension", () => {
    const dims = Object.keys(frontend.BARRIER_COMPLEXITY);
    for (const d of dims) {
      expect(calcAdaptationCost([d])).toBe(frontend.calcAdaptationCost([d]));
    }
    expect(calcAdaptationCost([])).toBe(frontend.calcAdaptationCost([]));
    expect(calcAdaptationCost(dims)).toBe(frontend.calcAdaptationCost(dims));
  });
});
