import { describe, it, expect } from "vitest";
import { PDF_CONTENT_WIDTH_PT } from "./mathToPdfText";
import { shareColumnPt } from "./columnWidth";

describe("shareColumnPt", () => {
  it("starts from the page content width when there is no enclosing column", () => {
    expect(shareColumnPt(undefined, {})).toBe(PDF_CONTENT_WIDTH_PT);
  });

  it("takes the fixed part off, then divides, then takes the per-part part off", () => {
    expect(shareColumnPt(200, { minus: 20, parts: 2, partMinus: 5 })).toBe(85);
  });

  it("never goes below 1 pt", () => {
    expect(shareColumnPt(10, { minus: 50 })).toBe(1);
  });
});
