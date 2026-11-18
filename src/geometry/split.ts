// Splitting for the print bed (SPEC §14). Pure module: it chooses where to cut, it does not cut.
// Vertical cuts (constant x), straight: the pieces are butted together and held by the backdrop or by glue.

export type SplitPoint = readonly [number, number];

export interface SplitInput {
  /** Outer profile of the housing, mm. */
  outline: readonly (readonly SplitPoint[])[];
  /** Centrelines of the segments: a cut crosses as few as possible. */
  centerlines: readonly (readonly SplitPoint[])[];
  /**
   * Intervals in x taken by a feature. `slot` (wire slot, corner pocket) is where the
   * strip already ends: cutting inside it costs little. `hole` (anchor, cable) is avoided by a few mm.
   */
  keepOut: readonly { x0: number; x1: number; kind?: 'hole' | 'slot' }[];
  bedW: number;
  bedH: number;
}

export interface SplitPiece {
  x0: number;
  x1: number;
}

export interface SplitPlan {
  /** Abscissas of the cuts, increasing. Empty: the sign fits the bed in one piece. */
  cutsX: number[];
  /** How many of the chosen cuts cross a lit channel: there the strip must be interrupted. */
  onChannel: number;
  pieces: SplitPiece[];
  bounds: { minX: number; maxX: number; minY: number; maxY: number };
  warnings: string[];
}

/** Margin from the edge of the bed, per side. */
export const BED_MARGIN = 5;
/** Air per side on every cut face: butted pieces do not force each other. */
export const SPLIT_CLEARANCE = 0.1;
/** Search step of the cuts. */
const STEP = 0.5;
/** A piece narrower than this does not print well. */
const MIN_PIECE = 30;
/**
 * A cut that crosses a lit channel forces interrupting the strip and soldering three wires
 * at the joint: it is the first thing to avoid, much more than a grazed feature.
 */
const COST_CROSSING = 40;
/** Channel almost parallel to the cut: it leaves a long sliver. */
const COST_GRAZING = 25;
/** Any cut crosses the outer profile: it barely counts, to prefer the narrow stretches. */
const COST_OUTLINE = 0.2;
/** Anchor or cable hole cut in half. It is avoided by a few millimetres. */
const COST_HOLE = 8;
const HOLE_PAD = 2;
/** Slot or pocket: there the strip already ends, the cut goes through almost without harm. */
const COST_SLOT = 2;
/** Inside a wide gap the cut goes in the middle: a bonus for every mm from the nearest channel. */
const CLEARANCE_BONUS = 0.25;
const CLEARANCE_MAX = 6;
/** One more piece is accepted only if it avoids at least half a channel crossing. */
const COST_EXTRA_PIECE = 20;
/** How many pieces more than the minimum can be tried. */
const EXTRA_CUTS_MAX = 2;
/** Under this sine of the angle between stroke and cut, the stroke is "almost parallel" (≈ 25°). */
const GRAZING_SIN = 0.42;

function boundsOf(outline: readonly (readonly SplitPoint[])[]): SplitPlan['bounds'] | null {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of outline) {
    for (const [x, y] of ring) {
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }
  return maxX > minX && maxY > minY ? { minX, maxX, minY, maxY } : null;
}

/** Cost of the crossings of a polyline with the line x = constant. */
function crossingCost(line: readonly SplitPoint[], closed: boolean, x: number, each: number, grazing: number): number {
  let cost = 0;
  const n = line.length;
  const last = closed ? n : n - 1;
  for (let i = 0; i < last; i++) {
    const a = line[i]!;
    const b = line[(i + 1) % n]!;
    if ((a[0] - x) * (b[0] - x) > 0) continue;
    if (a[0] === x && b[0] === x) {
      cost += grazing;
      continue;
    }
    // A vertex exactly on the cut counts only once: the stretch that starts there takes it.
    // The last point of an open line has no following stretch: it counts here.
    if (b[0] === x && (closed || i < last - 1)) continue;
    const length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    cost += each;
    if (length > 0 && Math.abs(b[0] - a[0]) / length < GRAZING_SIN) cost += grazing;
  }
  return cost;
}

/** The best set of `cuts` cuts, or null if none respects the limits of the pieces. */
function bestCuts(
  xs: readonly number[],
  costs: readonly number[],
  cuts: number,
  minX: number,
  maxX: number,
  maxPiece: number,
): { cost: number; chosen: number[] } | null {
  const width = maxX - minX;
  const ideal = width / (cuts + 1);
  const even = (piece: number): number => 1e-4 * Math.abs(piece - ideal);
  // best[i]: minimum cost with the last cut placed at candidate i.
  let best = xs.map((x, i) => {
    const piece = x - minX;
    return piece < MIN_PIECE || piece > maxPiece ? Infinity : costs[i]! + even(piece);
  });
  const from: number[][] = [];
  for (let k = 1; k < cuts; k++) {
    const next = new Array<number>(xs.length).fill(Infinity);
    const back = new Array<number>(xs.length).fill(-1);
    let lo = 0;
    for (let i = 0; i < xs.length; i++) {
      while (lo < i && xs[i]! - xs[lo]! > maxPiece) lo++;
      for (let j = lo; j < i; j++) {
        const piece = xs[i]! - xs[j]!;
        if (piece < MIN_PIECE) break;
        const value = best[j]! + costs[i]! + even(piece);
        if (value < next[i]!) {
          next[i] = value;
          back[i] = j;
        }
      }
    }
    from.push(back);
    best = next;
  }
  let end = -1;
  let endCost = Infinity;
  for (let i = 0; i < xs.length; i++) {
    const piece = maxX - xs[i]!;
    if (piece < MIN_PIECE || piece > maxPiece) continue;
    const value = best[i]! + even(piece);
    if (value < endCost) {
      endCost = value;
      end = i;
    }
  }
  if (end < 0 || !Number.isFinite(endCost)) return null;
  const chosen: number[] = [];
  let at = end;
  for (let k = cuts - 1; k >= 0; k--) {
    chosen.push(xs[at]!);
    if (k > 0) at = from[k - 1]![at]!;
  }
  chosen.reverse();
  return { cost: endCost, chosen };
}

/** Where to cut so that every piece fits the bed. Deterministic. */
export function planSplit(input: SplitInput): SplitPlan {
  const warnings: string[] = [];
  const bounds = boundsOf(input.outline) ?? { minX: 0, maxX: 0, minY: 0, maxY: 0 };
  const plan: SplitPlan = { cutsX: [], onChannel: 0, pieces: [{ x0: bounds.minX, x1: bounds.maxX }], bounds, warnings };
  const usableW = input.bedW - 2 * BED_MARGIN;
  const usableH = input.bedH - 2 * BED_MARGIN;
  if (!(usableW > MIN_PIECE) || !(usableH > MIN_PIECE)) {
    warnings.push(`Print bed ${input.bedW} × ${input.bedH} mm too small: no split.`);
    return plan;
  }
  const width = bounds.maxX - bounds.minX;
  const height = bounds.maxY - bounds.minY;
  if (!(width > 0)) return plan;
  const fits = (w: number, h: number): boolean => w <= usableW + 1e-9 && h <= usableH + 1e-9;
  if (fits(width, height) || fits(height, width)) return plan;

  // The pieces keep the height of the sign: on the bed it is placed along the side that contains it.
  let maxPiece = usableW;
  if (height > usableH + 1e-9 && height <= usableW + 1e-9) maxPiece = usableH;
  else if (height > Math.max(usableW, usableH) + 1e-9) {
    warnings.push(
      `Sign ${height.toFixed(0)} mm tall: beyond the print bed (${Math.max(usableW, usableH).toFixed(0)} mm usable). Horizontal cuts are not supported.`,
    );
    maxPiece = Math.min(usableW, usableH);
  }
  if (width <= maxPiece + 1e-9) return plan;

  // Candidates: a grid of pitch STEP between the two edges.
  const count = Math.floor(width / STEP);
  const xs: number[] = [];
  const costs: number[] = [];
  const onChannel: boolean[] = [];
  for (let i = 1; i < count; i++) {
    const x = bounds.minX + i * STEP;
    let channels = 0;
    for (const line of input.centerlines) channels += crossingCost(line, false, x, COST_CROSSING, COST_GRAZING);
    let cost = channels;
    // The outer profile is not a channel: a vertical stretch of it is not a sliver to avoid.
    for (const ring of input.outline) cost += crossingCost(ring, true, x, COST_OUTLINE, 0);
    for (const zone of input.keepOut) {
      const dist = Math.max(0, zone.x0 - x, x - zone.x1);
      if (zone.kind === 'slot') {
        if (dist === 0) cost += COST_SLOT;
      } else if (dist < HOLE_PAD) cost += COST_HOLE * (1 - dist / HOLE_PAD);
    }
    xs.push(x);
    costs.push(cost);
    onChannel.push(channels > 0);
  }

  // Distance of every candidate from the nearest channel, in two passes: the bonus puts the cut
  // in the middle of the gap instead of flush with the letter.
  const clearance = new Array<number>(xs.length).fill(Infinity);
  let run = Infinity;
  for (let i = 0; i < xs.length; i++) {
    run = onChannel[i] ? 0 : run + STEP;
    clearance[i] = run;
  }
  run = Infinity;
  for (let i = xs.length - 1; i >= 0; i--) {
    run = onChannel[i] ? 0 : run + STEP;
    if (run < clearance[i]!) clearance[i] = run;
  }
  for (let i = 0; i < xs.length; i++) costs[i] = costs[i]! - CLEARANCE_BONUS * Math.min(clearance[i]!, CLEARANCE_MAX);

  const minCuts = Math.ceil(width / maxPiece - 1e-9) - 1;
  const maxCuts = Math.max(minCuts, Math.floor(width / MIN_PIECE) - 1);
  const top = Math.min(maxCuts, minCuts + EXTRA_CUTS_MAX);
  let best: { cost: number; chosen: number[] } | null = null;
  for (let cuts = minCuts; cuts <= top; cuts++) {
    const got = bestCuts(xs, costs, cuts, bounds.minX, bounds.maxX, maxPiece);
    if (!got) continue;
    // One more piece has a cost: it is worth it only if it removes a joint to solder.
    const total = got.cost + COST_EXTRA_PIECE * (cuts - minCuts);
    if (!best || total < best.cost) best = { cost: total, chosen: got.chosen };
  }
  if (best) {
    const chosen = best.chosen;
    plan.cutsX = chosen;
    plan.pieces = chosen.map((x, i) => ({ x0: i === 0 ? bounds.minX : chosen[i - 1]!, x1: x }));
    plan.pieces.push({ x0: chosen[chosen.length - 1]!, x1: bounds.maxX });
    plan.onChannel = chosen.filter((x) => onChannel[Math.round((x - bounds.minX) / STEP) - 1]).length;
    if (plan.onChannel > 0) {
      warnings.push(
        `Print-bed split: ${plan.onChannel} joint${plan.onChannel === 1 ? ' crosses a lit channel' : 's cross a lit channel'}: there the strip must be cut and reconnected.`,
      );
    }
    return plan;
  }
  warnings.push('Print-bed split failed: no valid cut position.');
  return plan;
}
