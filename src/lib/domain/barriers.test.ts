import { describe, it, expect } from "vitest";
import {
  BARRIER_DIMENSIONS,
  BARRIER_COMPLEXITY,
  ADAPTATION_CREDITS,
  getComplexityTier,
  calcAdaptationCost,
} from "./barriers";

describe("BARRIER_DIMENSIONS", () => {
  it("contains the expected diagnostic dimensions", () => {
    const keys = BARRIER_DIMENSIONS.map((d) => d.key);
    expect(keys).toEqual(
      expect.arrayContaining([
        "tea",
        "tdah",
        "tod",
        "sindrome_down",
        "altas_habilidades",
        "dislexia",
        "discalculia",
        "disgrafia",
        "tourette",
        "dispraxia",
        "toc",
      ]),
    );
  });

  it("every dimension has a non-empty label and at least one barrier", () => {
    for (const dimension of BARRIER_DIMENSIONS) {
      expect(dimension.label.length).toBeGreaterThan(0);
      expect(dimension.barriers.length).toBeGreaterThan(0);
    }
  });

  it("every barrier has a non-empty key with namespace separator and a non-empty label", () => {
    for (const dimension of BARRIER_DIMENSIONS) {
      for (const barrier of dimension.barriers) {
        expect(barrier.key.length).toBeGreaterThan(0);
        expect(barrier.label.length).toBeGreaterThan(0);
        expect(barrier.key).toMatch(/^[a-z]+_[a-z_]+$/);
      }
    }
  });

  it("barrier keys are globally unique across all dimensions", () => {
    const keys = BARRIER_DIMENSIONS.flatMap((d) => d.barriers.map((b) => b.key));
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("dimension keys are globally unique", () => {
    const keys = BARRIER_DIMENSIONS.map((d) => d.key);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe("BARRIER_COMPLEXITY", () => {
  it("every dimension key in BARRIER_DIMENSIONS has a complexity entry", () => {
    for (const dim of BARRIER_DIMENSIONS) {
      expect(BARRIER_COMPLEXITY).toHaveProperty(dim.key);
    }
  });

  it("only uses valid tier values", () => {
    const validTiers = new Set(["low", "medium", "high"]);
    for (const tier of Object.values(BARRIER_COMPLEXITY)) {
      expect(validTiers.has(tier)).toBe(true);
    }
  });
});

describe("getComplexityTier", () => {
  it("returns 'medium' for empty input", () => {
    expect(getComplexityTier([])).toBe("medium");
  });

  it("returns 'low' for low-complexity dimensions only", () => {
    expect(getComplexityTier(["dislexia", "discalculia"])).toBe("low");
  });

  it("returns 'medium' for medium-complexity dimensions only", () => {
    expect(getComplexityTier(["tdah", "tod"])).toBe("medium");
  });

  it("returns 'high' for high-complexity dimensions only", () => {
    expect(getComplexityTier(["tea"])).toBe("high");
  });

  it("returns 'high' when any dimension is high, even if others are low", () => {
    expect(getComplexityTier(["dislexia", "tea"])).toBe("high");
  });

  it("returns 'medium' when mix of low and medium", () => {
    expect(getComplexityTier(["dislexia", "tdah"])).toBe("medium");
  });

  it("defaults unknown dimension to 'medium' without throwing", () => {
    expect(getComplexityTier(["unknown_dimension"])).toBe("medium");
  });
});

describe("calcAdaptationCost", () => {
  it("returns the medium credit cost for empty input", () => {
    expect(calcAdaptationCost([])).toBe(ADAPTATION_CREDITS.medium);
  });

  it("returns low-tier cost for dislexia", () => {
    expect(calcAdaptationCost(["dislexia"])).toBe(ADAPTATION_CREDITS.low);
  });

  it("returns medium-tier cost for tdah", () => {
    expect(calcAdaptationCost(["tdah"])).toBe(ADAPTATION_CREDITS.medium);
  });

  it("returns high-tier cost for tea", () => {
    expect(calcAdaptationCost(["tea"])).toBe(ADAPTATION_CREDITS.high);
  });

  it("escalates to highest tier when multiple dimensions are selected", () => {
    expect(calcAdaptationCost(["dislexia", "tea"])).toBe(ADAPTATION_CREDITS.high);
    expect(calcAdaptationCost(["discalculia", "tdah"])).toBe(ADAPTATION_CREDITS.medium);
  });

  it("all tier costs are positive integers in ascending order", () => {
    expect(ADAPTATION_CREDITS.low).toBeGreaterThan(0);
    expect(ADAPTATION_CREDITS.medium).toBeGreaterThan(ADAPTATION_CREDITS.low);
    expect(ADAPTATION_CREDITS.high).toBeGreaterThan(ADAPTATION_CREDITS.medium);
  });
});
