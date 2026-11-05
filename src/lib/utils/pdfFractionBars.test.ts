import { describe, it, expect } from "vitest";
import { fractionBarsFromOperatorList } from "./pdfFractionBars";

/** The pdf.js 6 operator numbers the module reads (`OPS`), by name. */
const OPS = {
  save: 10,
  restore: 11,
  transform: 12,
  setLineWidth: 2,
  stroke: 20,
  closeStroke: 21,
  fill: 22,
  eoFill: 23,
  fillStroke: 24,
  eoFillStroke: 25,
  closeFillStroke: 26,
  closeEOFillStroke: 27,
  endPath: 28,
  constructPath: 91,
};

type Op = [number, unknown];
const list = (ops: Op[]) => ({ fnArray: ops.map(([fn]) => fn), argsArray: ops.map(([, args]) => args) });

/** moveTo/lineTo/closePath path as pdf.js hands it back (a flat typed array). */
const rect = (x0: number, y0: number, x1: number, y1: number) =>
  Float32Array.from([0, x0, y0, 1, x1, y0, 1, x1, y1, 1, x0, y1, 4]);
const painted = (paintOp: number, path: ArrayLike<number>): Op => [OPS.constructPath, [paintOp, [path], [0, 0, 0, 0]]];

describe("fractionBarsFromOperatorList", () => {
  it("reads the real N2 bar: a 0.6 pt filled rectangle between the numerator and the denominator", () => {
    // a75c4b-N2-9ano-funcao-pdf.pdf, op 108 of page 1
    const bars = fractionBarsFromOperatorList(list([painted(OPS.eoFill, rect(165.5, 659.55, 195, 660.15))]), OPS);
    expect(bars).toHaveLength(1);
    expect(bars[0].x0).toBeCloseTo(165.5, 1);
    expect(bars[0].x1).toBeCloseTo(195, 1);
    expect(bars[0].y).toBeCloseTo(659.85, 2);
  });

  it("reads every fill and fill-stroke painting op", () => {
    for (const op of [OPS.fill, OPS.eoFill, OPS.fillStroke, OPS.eoFillStroke, OPS.closeFillStroke, OPS.closeEOFillStroke]) {
      expect(fractionBarsFromOperatorList(list([painted(op, rect(10, 50, 40, 50.5))]), OPS)).toHaveLength(1);
    }
  });

  it("reads a thin stroked horizontal line using the current line width", () => {
    const line = Float32Array.from([0, 20, 70, 1, 60, 70]);
    expect(fractionBarsFromOperatorList(list([[OPS.setLineWidth, [0.8]], painted(OPS.stroke, line)]), OPS)).toEqual([
      { x0: 20, x1: 60, y: 70 },
    ]);
    expect(fractionBarsFromOperatorList(list([[OPS.setLineWidth, [0.8]], painted(OPS.closeStroke, line)]), OPS)).toHaveLength(1);
  });

  it("ignores a thick stroke, a vertical line, a thick rectangle and a tiny dot", () => {
    const line = Float32Array.from([0, 20, 70, 1, 60, 70]);
    expect(fractionBarsFromOperatorList(list([[OPS.setLineWidth, [3]], painted(OPS.stroke, line)]), OPS)).toEqual([]);
    const vertical = Float32Array.from([0, 20, 10, 1, 20, 70]);
    expect(fractionBarsFromOperatorList(list([[OPS.setLineWidth, [0.5]], painted(OPS.stroke, vertical)]), OPS)).toEqual([]);
    expect(fractionBarsFromOperatorList(list([painted(OPS.fill, rect(10, 50, 40, 58))]), OPS)).toEqual([]);
    expect(fractionBarsFromOperatorList(list([painted(OPS.fill, rect(10, 50, 11, 50.5))]), OPS)).toEqual([]);
  });

  it("ignores paths that are not painted lines or rectangles", () => {
    // clip / no-paint, a curve, a bare moveTo and a path with an unknown segment code
    expect(fractionBarsFromOperatorList(list([painted(OPS.endPath, rect(10, 50, 40, 50.5))]), OPS)).toEqual([]);
    const curve = Float32Array.from([0, 10, 50, 2, 1, 2, 3, 4, 40, 50]);
    expect(fractionBarsFromOperatorList(list([painted(OPS.fill, curve)]), OPS)).toEqual([]);
    expect(fractionBarsFromOperatorList(list([painted(OPS.fill, Float32Array.from([0, 10, 50]))]), OPS)).toEqual([]);
    expect(fractionBarsFromOperatorList(list([painted(OPS.fill, Float32Array.from([9, 10, 50]))]), OPS)).toEqual([]);
    // not a constructPath with the pdf.js 6 shape
    expect(fractionBarsFromOperatorList(list([[OPS.constructPath, null], [OPS.constructPath, [OPS.fill]]]), OPS)).toEqual([]);
    expect(fractionBarsFromOperatorList(list([[OPS.constructPath, [OPS.fill, [null], null]]]), OPS)).toEqual([]);
  });

  it("applies the current transform and restores it with the graphics state", () => {
    // scale 2 and move by (10, 100): the bar at x 5..15, y 20..20.25 lands at x 20..40, y 140..140.5
    const ops: Op[] = [
      [OPS.save, null],
      [OPS.transform, [2, 0, 0, 2, 10, 100]],
      painted(OPS.fill, rect(5, 20, 15, 20.25)),
      [OPS.restore, null],
      painted(OPS.fill, rect(5, 20, 15, 20.25)),
    ];
    const bars = fractionBarsFromOperatorList(list(ops), OPS);
    expect(bars).toHaveLength(2);
    expect(bars[0].x0).toBeCloseTo(20, 3);
    expect(bars[0].x1).toBeCloseTo(40, 3);
    expect(bars[0].y).toBeCloseTo(140.25, 3);
    expect(bars[1].x0).toBeCloseTo(5, 3);
  });

  it("composes nested transforms and skips rotated or flipped content", () => {
    const nested = fractionBarsFromOperatorList(
      list([[OPS.transform, [1, 0, 0, 1, 10, 0]], [OPS.transform, [2, 0, 0, 1, 0, 0]], painted(OPS.fill, rect(5, 20, 15, 20.25))]),
      OPS,
    );
    expect(nested[0].x0).toBeCloseTo(20, 3);
    expect(nested[0].x1).toBeCloseTo(40, 3);
    const rotated = fractionBarsFromOperatorList(list([[OPS.transform, [0, 1, -1, 0, 0, 0]], painted(OPS.fill, rect(5, 20, 15, 20.25))]), OPS);
    expect(rotated).toEqual([]);
    // a negative vertical scale (a flipped page space) still gives a thin horizontal bar
    const flipped = fractionBarsFromOperatorList(list([[OPS.transform, [1, 0, 0, -1, 0, 100]], painted(OPS.fill, rect(5, 20, 15, 20.25))]), OPS);
    expect(flipped).toHaveLength(1);
    expect(flipped[0].y).toBeCloseTo(79.875, 3);
  });

  it("skips a slightly skewed space: only an axis-aligned transform keeps a rule horizontal (L10 B3)", () => {
    for (const skew of [
      [1, 0.01, 0, 1, 0, 0],
      [1, 0, 0.01, 1, 0, 0],
    ]) {
      expect(fractionBarsFromOperatorList(list([[OPS.transform, skew], painted(OPS.fill, rect(5, 20, 15, 20.25))]), OPS)).toEqual([]);
    }
  });

  it("ignores a slanted stroke and a fill with only two points (L10 B5, B6)", () => {
    const slanted = Float32Array.from([0, 20, 70, 1, 60, 75]);
    expect(fractionBarsFromOperatorList(list([[OPS.setLineWidth, [0.5]], painted(OPS.stroke, slanted)]), OPS)).toEqual([]);
    const twoPoints = Float32Array.from([0, 10, 50, 1, 40, 50]);
    expect(fractionBarsFromOperatorList(list([painted(OPS.fill, twoPoints)]), OPS)).toEqual([]);
  });

  it("scales the stroke width by the vertical scale before judging its thickness (L10 B8)", () => {
    const line = Float32Array.from([0, 20, 70, 1, 60, 70]);
    // 3 units drawn at 0.4 is 1.2 pt on the page: still a bar
    expect(
      fractionBarsFromOperatorList(list([[OPS.transform, [1, 0, 0, 0.4, 0, 0]], [OPS.setLineWidth, [3]], painted(OPS.stroke, line)]), OPS),
    ).toHaveLength(1);
    // 1 unit drawn at 2 is 2 pt on the page: too thick
    expect(
      fractionBarsFromOperatorList(list([[OPS.transform, [1, 0, 0, 2, 0, 0]], [OPS.setLineWidth, [1]], painted(OPS.stroke, line)]), OPS),
    ).toEqual([]);
  });

  it("a restore with nothing saved is harmless", () => {
    expect(fractionBarsFromOperatorList(list([[OPS.restore, null], painted(OPS.fill, rect(10, 50, 40, 50.5))]), OPS)).toHaveLength(1);
  });

  it("skips operators that have nothing to do with rules (text, colour)", () => {
    expect(fractionBarsFromOperatorList(list([[44, ["a"]], [59, null], painted(OPS.fill, rect(10, 50, 40, 50.5))]), OPS)).toHaveLength(1);
  });

  it("returns nothing for an empty list", () => {
    expect(fractionBarsFromOperatorList(list([]), OPS)).toEqual([]);
  });
});
