import { describe, it, expect } from "vitest";
import { BARRIER_DIMENSIONS } from "./barriers";

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
