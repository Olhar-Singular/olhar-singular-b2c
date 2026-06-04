import { describe, it, expect } from "vitest";
import { setStep, addStep, removeStep } from "./scaffoldOps";

describe("setStep", () => {
  it("replaces the step at the index", () => {
    expect(setStep(["a", "b"], 1, "B")).toEqual(["a", "B"]);
  });
  it("returns unchanged when index out of range", () => {
    const items = ["a"];
    expect(setStep(items, 5, "x")).toBe(items);
    expect(setStep(items, -1, "x")).toBe(items);
  });
});

describe("addStep", () => {
  it("appends an empty step", () => {
    expect(addStep(["a"])).toEqual(["a", ""]);
  });
});

describe("removeStep", () => {
  it("removes the step at the index", () => {
    expect(removeStep(["a", "b", "c"], 1)).toEqual(["a", "c"]);
  });
  it("returns unchanged when index out of range", () => {
    const items = ["a"];
    expect(removeStep(items, 5)).toBe(items);
    expect(removeStep(items, -1)).toBe(items);
  });
});
