/**
 * Fraction bars from a pdf.js operator list (L9A-1).
 *
 * The text layer has no fraction bar: a stacked fraction is two short runs, one over the
 * other. That is also exactly what a centred two-line header, a pair of alternatives or an
 * armed sum (347 over 256) looks like, so the positions alone cannot say "this is a
 * fraction". The bar itself is drawn as a thin filled rectangle (Word/LibreOffice) or a
 * thin stroked line, and the operator list carries it. This module returns those thin
 * horizontal rules, in page coordinates, so `pageTextFromItems` can ask "is there a bar
 * between these two lines?".
 *
 * Pure: the pdf.js `OPS` table is passed in, so it is tested with real operator shapes.
 */

export interface FractionBar {
  /** Left and right ends, in page coordinates. */
  x0: number;
  x1: number;
  /** Vertical centre of the rule. */
  y: number;
}

export interface OperatorListLike {
  fnArray: ArrayLike<number>;
  argsArray: ArrayLike<unknown>;
}

type Matrix = [number, number, number, number, number, number];
interface GraphicsState {
  ctm: Matrix;
  lineWidth: number;
}

/** A rule thicker than this is a box edge or a drawing, not a fraction bar. */
const MAX_BAR_THICKNESS = 1.5;
/** A shorter mark is a dot or a tick. */
const MIN_BAR_LENGTH = 4;

// pdf.js `DrawOPS`: the segment codes of a constructPath path.
const MOVE_TO = 0;
const LINE_TO = 1;
const CLOSE_PATH = 4;

const multiply = (m: Matrix, n: Matrix): Matrix => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

/** The corner points of a path made only of moveTo / lineTo / closePath; null for anything else. */
function polygonPoints(path: ArrayLike<number>): Array<[number, number]> | null {
  const points: Array<[number, number]> = [];
  for (let i = 0; i < path.length; ) {
    const code = path[i];
    if (code === CLOSE_PATH) {
      i += 1;
    } else if (code === MOVE_TO || code === LINE_TO) {
      points.push([path[i + 1], path[i + 2]]);
      i += 3;
    } else {
      return null;
    }
  }
  return points;
}

/** The painted path of a constructPath op, as `[paintOp, path]`, or null when it has another shape. */
function paintedPath(args: unknown): { paintOp: number; path: ArrayLike<number> } | null {
  if (!Array.isArray(args) || !Array.isArray(args[1])) return null;
  const path = args[1][0] as ArrayLike<number> | null | undefined;
  return path ? { paintOp: args[0] as number, path } : null;
}

export function fractionBarsFromOperatorList(list: OperatorListLike, ops: Record<string, number>): FractionBar[] {
  const fills = new Set([ops.fill, ops.eoFill, ops.fillStroke, ops.eoFillStroke, ops.closeFillStroke, ops.closeEOFillStroke]);
  const strokes = new Set([ops.stroke, ops.closeStroke]);
  const bars: FractionBar[] = [];
  const stack: GraphicsState[] = [];
  let state: GraphicsState = { ctm: [1, 0, 0, 1, 0, 0], lineWidth: 1 };

  /** A horizontal rule of this extent in the current space, or nothing when the space is rotated. */
  const addBar = (xa: number, xb: number, ya: number, yb: number, minThickness: number): void => {
    const [a, b, c, d, e, f] = state.ctm;
    if (Math.abs(b) > 1e-6 || Math.abs(c) > 1e-6) return;
    const x0 = Math.min(a * xa + e, a * xb + e);
    const x1 = Math.max(a * xa + e, a * xb + e);
    const yA = d * ya + f;
    const yB = d * yb + f;
    const thickness = Math.max(Math.abs(yA - yB), minThickness * Math.abs(d));
    if (thickness > MAX_BAR_THICKNESS || x1 - x0 < MIN_BAR_LENGTH) return;
    bars.push({ x0, x1, y: (yA + yB) / 2 });
  };

  for (let i = 0; i < list.fnArray.length; i += 1) {
    const fn = list.fnArray[i];
    const args = list.argsArray[i];
    if (fn === ops.save) {
      stack.push(state);
      state = { ...state };
    } else if (fn === ops.restore) {
      state = stack.pop() ?? state;
    } else if (fn === ops.transform) {
      state = { ...state, ctm: multiply(state.ctm, args as Matrix) };
    } else if (fn === ops.setLineWidth) {
      state = { ...state, lineWidth: (args as number[])[0] };
    } else if (fn === ops.constructPath) {
      const painted = paintedPath(args);
      const points = painted && polygonPoints(painted.path);
      if (!painted || !points || points.length < 2) continue;
      const xs = points.map(([x]) => x);
      const ys = points.map(([, y]) => y);
      if (fills.has(painted.paintOp) && points.length >= 3) {
        addBar(Math.min(...xs), Math.max(...xs), Math.min(...ys), Math.max(...ys), 0);
      } else if (strokes.has(painted.paintOp) && points.length === 2 && ys[0] === ys[1]) {
        addBar(Math.min(...xs), Math.max(...xs), ys[0], ys[0], state.lineWidth);
      }
    }
  }
  return bars;
}
