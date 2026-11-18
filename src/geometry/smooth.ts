// [E] Chaikin smoothing + resampling (SPEC §5). Pure module.
// Two passes of the classic quarter rule: the fillet grows with the letter, so a
// taller text eases the bends. Then it is resampled at constant pitch.

import type { Point } from './rasterize';

export const CHAIKIN_ITERATIONS = 2;
/** Resampling pitch after smoothing, mm. */
export const SMOOTH_STEP_MM = 1;

const dist = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

const lerp = (a: Point, b: Point, t: number): Point => [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];

function dropClosing(points: readonly Point[]): Point[] {
  if (points.length >= 2 && dist(points[0]!, points[points.length - 1]!) <= 1e-6) return points.slice(0, -1);
  return points.slice();
}

function chaikinOnce(points: readonly Point[], closed: boolean): Point[] {
  const n = points.length;
  if (n < (closed ? 3 : 2)) return points.slice();
  const out: Point[] = [];
  if (!closed) out.push(points[0]!);
  const count = closed ? n : n - 1;
  for (let i = 0; i < count; i++) {
    const p = points[i]!;
    const q = points[closed ? (i + 1) % n : i + 1]!;
    const len = dist(p, q);
    if (len < 1e-9) continue;
    const t = 0.25;
    out.push(lerp(p, q, t), lerp(p, q, 1 - t));
  }
  if (!closed) out.push(points[n - 1]!);
  return out.length >= 2 ? out : points.slice();
}

/** Points at constant arc pitch, ends included. Closed: the first point is repeated at the end. */
export function resampleByArcLength(points: readonly Point[], stepMm: number, closed: boolean): Point[] {
  const ring = closed ? dropClosing(points) : points.slice();
  if (ring.length === 0) return [];
  if (ring.length === 1) return closed ? [ring[0]!, ring[0]!] : [ring[0]!];
  const seq = closed ? [...ring, ring[0]!] : ring;
  const step = Math.max(stepMm, 1e-3);
  const out: Point[] = [seq[0]!];
  let carry = 0;
  for (let i = 1; i < seq.length; i++) {
    const a = seq[i - 1]!;
    const b = seq[i]!;
    const len = dist(a, b);
    if (len < 1e-9) continue;
    let done = step - carry;
    while (done <= len + 1e-9) {
      out.push(lerp(a, b, Math.min(1, done / len)));
      done += step;
    }
    carry = len - (done - step);
  }
  const end = seq[seq.length - 1]!;
  if (dist(out[out.length - 1]!, end) > 1e-4) out.push(end);
  else out[out.length - 1] = end;
  return out;
}

/** Chaikin (fixed ends if open) and resampling. */
export function smoothPolyline(
  points: readonly Point[],
  closed: boolean,
  iterations = CHAIKIN_ITERATIONS,
  stepMm = SMOOTH_STEP_MM,
): Point[] {
  if (points.length < 2) return points.slice();
  let cur = closed ? dropClosing(points) : points.slice();
  if (closed && cur.length < 3) return [...cur, cur[0]!];
  for (let k = 0; k < iterations; k++) cur = chaikinOnce(cur, closed);
  return resampleByArcLength(cur, stepMm, closed);
}

/** Turn beyond which a vertex of a single-stroke font is an intended cusp, not a curve. */
export const STROKE_CORNER_DEG = 75;

function turnDeg(a: Point, b: Point, c: Point): number {
  const ux = b[0] - a[0];
  const uy = b[1] - a[1];
  const vx = c[0] - b[0];
  const vy = c[1] - b[1];
  const lu = Math.hypot(ux, uy);
  const lv = Math.hypot(vx, vy);
  if (lu < 1e-9 || lv < 1e-9) return 0;
  const cos = Math.min(1, Math.max(-1, (ux * vx + uy * vy) / (lu * lv)));
  return (Math.acos(cos) * 180) / Math.PI;
}

/** Centripetal Catmull-Rom between p1 and p2 (Barry–Goldman), parameter u in [0, 1]. */
function catmullRom(p0: Point, p1: Point, p2: Point, p3: Point, u: number): Point {
  const knot = (a: Point, b: Point, t: number): number => t + Math.max(Math.sqrt(dist(a, b)), 1e-6);
  const t0 = 0;
  const t1 = knot(p0, p1, t0);
  const t2 = knot(p1, p2, t1);
  const t3 = knot(p2, p3, t2);
  const t = t1 + (t2 - t1) * u;
  const mix = (a: Point, b: Point, ta: number, tb: number): Point => {
    const w = (tb - t) / (tb - ta);
    return [a[0] * w + b[0] * (1 - w), a[1] * w + b[1] * (1 - w)];
  };
  const a1 = mix(p0, p1, t0, t1);
  const a2 = mix(p1, p2, t1, t2);
  const a3 = mix(p2, p3, t2, t3);
  const b1 = mix(a1, a2, t0, t2);
  const b2 = mix(a2, a3, t1, t3);
  return mix(b1, b2, t1, t2);
}

/** A run without cusps: spline through all the vertices, sampled at ~stepMm. */
function splineRun(run: readonly Point[], closed: boolean, stepMm: number): Point[] {
  const n = run.length;
  if (n < 3 && !closed) return run.slice();
  const at = (i: number): Point => {
    if (closed) return run[((i % n) + n) % n]!;
    // Beyond the ends: quadratic extrapolation on the last three points, so the first and
    // last spans continue the curvature instead of straightening (with two points, a reflection).
    if (i < 0) {
      const a = run[0]!;
      const b = run[1]!;
      const c = run[2];
      return c ? [3 * a[0] - 3 * b[0] + c[0], 3 * a[1] - 3 * b[1] + c[1]] : [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    if (i > n - 1) {
      const a = run[n - 1]!;
      const b = run[n - 2]!;
      const c = run[n - 3];
      return c ? [3 * a[0] - 3 * b[0] + c[0], 3 * a[1] - 3 * b[1] + c[1]] : [2 * a[0] - b[0], 2 * a[1] - b[1]];
    }
    return run[i]!;
  };
  const spans = closed ? n : n - 1;
  const out: Point[] = [run[0]!];
  for (let i = 0; i < spans; i++) {
    const p1 = at(i);
    const p2 = at(i + 1);
    const steps = Math.max(1, Math.ceil(dist(p1, p2) / stepMm));
    for (let k = 1; k <= steps; k++) {
      out.push(k === steps ? [p2[0], p2[1]] : catmullRom(at(i - 1), p1, p2, at(i + 2), k / steps));
    }
  }
  return out;
}

/**
 * Single-stroke fonts (SPEC §4): the glyphs are coarse polylines. A spline through every
 * vertex rebuilds their curve; turns beyond `cornerDeg` stay cusps. Closed: the first
 * point is repeated at the end, as in the input.
 */
export function splineThroughPolyline(
  points: readonly Point[],
  closed: boolean,
  stepMm = SMOOTH_STEP_MM,
  cornerDeg = STROKE_CORNER_DEG,
): Point[] {
  const pts = closed ? dropClosing(points) : points.filter((p, i) => i === 0 || dist(p, points[i - 1]!) > 1e-9);
  if (pts.length < 3) return points.slice();
  const n = pts.length;
  const corner = pts.map((p, i) => {
    if (!closed && (i === 0 || i === n - 1)) return true;
    return turnDeg(pts[(i - 1 + n) % n]!, p, pts[(i + 1) % n]!) > cornerDeg;
  });
  const corners = corner.flatMap((isCorner, i) => (isCorner ? [i] : []));
  if (closed && corners.length === 0) {
    const ring = splineRun(pts, true, stepMm);
    return ring;
  }
  // Runs between consecutive cusps; closed: it starts from the first cusp and goes around.
  const out: Point[] = [];
  const order = closed ? [...corners, corners[0]! + n] : corners;
  for (let c = 0; c + 1 < order.length; c++) {
    const run: Point[] = [];
    for (let i = order[c]!; i <= order[c + 1]!; i++) run.push(pts[i % n]!);
    const piece = splineRun(run, false, stepMm);
    out.push(...(out.length > 0 ? piece.slice(1) : piece));
  }
  return out;
}
