// [G] Errors and warnings with position (SPEC §5). A bend beyond the maximum is a
// "curva" (curve) if the radius grows with scale, a "spigolo" (cusp) if it sits in at most two
// hinges and the radius does not grow. Pure module.

import type { ChainHinge, ChainPath } from './chain';
import { rMin, type Params } from '../config';
import type { Point } from './rasterize';
import type { SegmentNotice } from './segment';

export type IssueLevel = 'error' | 'warning';

/** curva: it eases when made bigger. spigolo: a cusp, scale is not enough. */
export type BendKind = 'curva' | 'spigolo';

export interface ValidationIssue {
  level: IssueLevel;
  bend: BendKind | null;
  segmentId: number | null;
  /** Local radius of the bend, mm. null if the issue is not a bend. */
  radiusMm: number | null;
  message: string;
  x: number;
  y: number;
}

export interface ValidateInput {
  chains: readonly (ChainPath & { id: number; dot?: boolean })[];
  /**
   * The same chains built at double scale, with the positions brought back
   * to the original and the radius left in millimetres of the double scale.
   */
  scaledChains?: readonly (ChainPath & { id: number })[];
  notices: readonly SegmentNotice[];
  params: Params;
}

/** Under this growth of the radius (×2 scale) the bend does not ease. */
const RADIUS_GROWTH = 1.5;

const where = (x: number, y: number): string => `(${x.toFixed(1)}, ${y.toFixed(1)}) mm`;

function pointAt(points: readonly Point[], distance: number): Point {
  if (points.length === 0) return [0, 0];
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= len || i === points.length - 1) {
      const t = len > 1e-9 ? Math.min(1, left / len) : 0;
      return [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
    }
    left -= len;
  }
  return points[points.length - 1]!;
}

/**
 * Tightest radius near the group. null = only straight stretches are left around.
 * undefined = no hinge within the search radius.
 */
function tightestNear(chain: ChainPath | undefined, hinges: readonly ChainHinge[], reach: number): number | null | undefined {
  if (!chain) return undefined;
  let best: number | null | undefined = undefined;
  for (const origin of hinges) {
    for (const hinge of chain.hinges) {
      if (Math.hypot(hinge.x - origin.x, hinge.y - origin.y) > reach) continue;
      if (hinge.radiusMm === null) {
        if (best === undefined) best = null;
        continue;
      }
      if (best === undefined || best === null || hinge.radiusMm < best) best = hinge.radiusMm;
    }
  }
  return best;
}

/** A group of hinges beyond the maximum is a cusp only if it is short and does not widen. */
function clusterKind(cluster: readonly ChainHinge[], scaled: ChainPath | undefined, pitch: number): BendKind {
  const currentR = cluster.reduce((min, hinge) => {
    const radius = hinge.radiusMm;
    return radius === null ? min : Math.min(min, radius);
  }, Infinity);
  const scaledR = tightestNear(scaled, cluster, pitch * 2);
  const grows = scaledR === undefined || scaledR === null || !(currentR < Infinity) || scaledR >= currentR * RADIUS_GROWTH;
  return !grows && cluster.length <= 2 ? 'spigolo' : 'curva';
}

/** Warnings and errors, errors first, then from top to bottom. */
export function validateStrip(input: ValidateInput): ValidationIssue[] {
  const { params } = input;
  const minRadius = rMin(params);
  const scaledById = new Map((input.scaledChains ?? []).map((chain) => [chain.id, chain]));
  const issues: ValidationIssue[] = [];

  for (const chain of input.chains) {
    const slot = chain.closed || chain.dot ? 0 : params.WIRE_SLOT_L * 2;
    const useful = Math.max(0, chain.lengthMm - slot);
    if (useful < params.CUT_PITCH - 1e-6) {
      const mid = pointAt(chain.points, chain.lengthMm / 2);
      issues.push({
        level: 'error',
        bend: null,
        segmentId: chain.id,
        radiusMm: null,
        x: mid[0],
        y: mid[1],
        message: `Segment ${chain.id}: lit length ${useful.toFixed(1)} mm, under the cut pitch ${params.CUT_PITCH.toFixed(1)} mm, at ${where(mid[0], mid[1])}.`,
      });
    }
    const kinds = new Map<ChainHinge, BendKind>();
    let cursor = 0;
    const hinges = chain.hinges;
    while (cursor < hinges.length) {
      if (!hinges[cursor]!.over) {
        cursor += 1;
        continue;
      }
      let end = cursor + 1;
      while (end < hinges.length && hinges[end]!.over) end += 1;
      const cluster = hinges.slice(cursor, end);
      const kind = clusterKind(cluster, scaledById.get(chain.id), params.HINGE_PITCH);
      for (const hinge of cluster) kinds.set(hinge, kind);
      cursor = end;
    }
    for (const hinge of hinges) {
      if (!hinge.over) continue;
      const bend = kinds.get(hinge) ?? 'curva';
      const radius = hinge.radiusMm === null ? '∞' : hinge.radiusMm.toFixed(1);
      const kind = bend === 'curva' ? 'curve too tight' : 'cusp';
      const remedy = bend === 'curva' ? 'It eases when the text is made bigger.' : 'It does not ease when the text is made bigger.';
      issues.push({
        level: 'error',
        bend,
        segmentId: chain.id,
        radiusMm: hinge.radiusMm,
        x: hinge.x,
        y: hinge.y,
        message: `Segment ${chain.id}: ${kind}, radius ${radius} mm (angle ${hinge.angleDeg.toFixed(1)}°, minimum ${minRadius.toFixed(1)} mm), at ${where(hinge.x, hinge.y)}. ${remedy}`,
      });
    }
  }

  for (const notice of input.notices) {
    if (notice.kind === 'crossing') {
      issues.push({
        level: 'warning',
        bend: null,
        segmentId: null,
        radiusMm: null,
        x: notice.x,
        y: notice.y,
        message: `Crossing interrupted by ${params.CROSSING_GAP.toFixed(1)} mm per side, at ${where(notice.x, notice.y)}.`,
      });
    } else if (notice.kind === 'excluded') {
      const radius = notice.radiusMm ?? 0;
      issues.push({
        level: 'warning',
        bend: null,
        segmentId: null,
        radiusMm: notice.radiusMm,
        x: notice.x,
        y: notice.y,
        message: `Closed loop excluded: radius ${radius.toFixed(1)} mm under the minimum ${minRadius.toFixed(1)} mm, at ${where(notice.x, notice.y)}.`,
      });
    } else if (notice.kind === 'unlit') {
      const radius = notice.radiusMm ?? 0;
      issues.push({
        level: 'warning',
        bend: null,
        segmentId: null,
        radiusMm: notice.radiusMm,
        x: notice.x,
        y: notice.y,
        message: `Dot not lit, radius ${radius.toFixed(1)} mm, at ${where(notice.x, notice.y)}.`,
      });
    } else {
      issues.push({
        level: 'warning',
        bend: null,
        segmentId: null,
        radiusMm: null,
        x: notice.x,
        y: notice.y,
        message: `Degree-${notice.degree ?? 0} junction: only the straightest pair continues, at ${where(notice.x, notice.y)}.`,
      });
    }
  }

  const rank = (level: IssueLevel): number => (level === 'error' ? 0 : 1);
  issues.sort((a, b) => rank(a.level) - rank(b.level) || b.y - a.y || a.x - b.x || a.message.localeCompare(b.message));
  return issues;
}

export interface ClearanceClash {
  x: number;
  y: number;
  distance: number;
  limit: number;
  /**
   * Zones in which the two strokes are closer than the width of the strip: two strips do not
   * fit side by side there. One is cut and bridged with a wire jumper.
   */
  overlaps: number;
}

interface ClearanceLine {
  points: readonly Point[];
  closed?: boolean;
}

const CLEARANCE_STEP = 2;
/** Under this angle between the two branches the stroke turns back: they are the two walls of a tube, not a corner. */
const WALL_FOLD_DEG = 20;

function arcSamples(
  points: readonly Point[],
  step: number,
  closed: boolean,
): { p: Point; s: number; dir: [number, number] }[] {
  if (points.length === 0) return [];
  const out: { p: Point; s: number; dir: [number, number] }[] = [];
  let s = 0;
  let next = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 1e-9) continue;
    const dir: [number, number] = [(b[0] - a[0]) / seg, (b[1] - a[1]) / seg];
    while (next <= s + seg + 1e-9) {
      const t = (next - s) / seg;
      if (t >= -1e-6 && t <= 1 + 1e-6) {
        const u = Math.min(1, Math.max(0, t));
        out.push({ p: [a[0] + (b[0] - a[0]) * u, a[1] + (b[1] - a[1]) * u], s: next, dir });
      }
      next += step;
    }
    s += seg;
  }
  if (closed && out.length > 1) {
    const a = out[0]!.p;
    const b = out[out.length - 1]!.p;
    if (Math.hypot(a[0] - b[0], a[1] - b[1]) < 0.05) out.pop();
  }
  return out;
}

/** The two branches open by at least `deg`: it is a corner, not two walls side by side. */
function legsDiverge(ja: Point, pa: Point, jb: Point, pb: Point, deg: number): boolean {
  const ax = pa[0] - ja[0];
  const ay = pa[1] - ja[1];
  const bx = pb[0] - jb[0];
  const by = pb[1] - jb[1];
  const la = Math.hypot(ax, ay);
  const lb = Math.hypot(bx, by);
  if (la < 1e-6 || lb < 1e-6) return true;
  const cos = (ax * bx + ay * by) / (la * lb);
  const angle = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  return angle >= deg;
}

/** An end within this distance of another stroke touches it: it is a T junction, not a merge. */
const TOUCH_TOL = 0.5;

function nearestOnPolyline(p: Point, points: readonly Point[]): { d: number; s: number } {
  let best = { d: Infinity, s: 0 };
  let s = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len2 = dx * dx + dy * dy;
    const len = Math.sqrt(len2);
    const t = len2 > 1e-12 ? Math.min(1, Math.max(0, ((p[0] - a[0]) * dx + (p[1] - a[1]) * dy) / len2)) : 0;
    const d = Math.hypot(p[0] - (a[0] + t * dx), p[1] - (a[1] + t * dy));
    if (d < best.d) best = { d, s: s + t * len };
    s += len;
  }
  return best;
}

/**
 * Open ends that finish on another stroke, or on the same one far from the end:
 * the T junctions of the graph (§5 [D], degree-3 nodes). There the outlines touch by
 * design, as at a crossing, and scale does not separate them. It must be called on the lines
 * before smoothing, where the end sits exactly on the other stroke.
 */
export function touchPoints(
  lines: readonly ClearanceLine[],
  params: Pick<Params, 'CHANNEL_W' | 'WALL' | 'MIN_GAP'>,
): Point[] {
  const limit = params.CHANNEL_W + 2 * params.WALL + params.MIN_GAP;
  const out: Point[] = [];
  lines.forEach((line, index) => {
    const pts = line.points;
    if (line.closed === true || pts.length < 2) return;
    let length = 0;
    for (let i = 1; i < pts.length; i++) length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
    for (const [end, s] of [
      [pts[0]!, 0],
      [pts[pts.length - 1]!, length],
    ] as const) {
      const touches = lines.some((other, j) => {
        if (other.points.length < 2) return false;
        const hit = nearestOnPolyline(end, other.points);
        if (hit.d > TOUCH_TOL) return false;
        if (j !== index) return true;
        return Math.abs(hit.s - s) > limit;
      });
      if (touches) out.push([end[0], end[1]]);
    }
  });
  return out;
}

/**
 * Two non-adjacent strokes of the centreline closer than
 * CHANNEL_W + 2·WALL + MIN_GAP: the outlines merge.
 * It also holds between the two walls of the same tube (stripMode "walls"): the minimum
 * height keeps them a channel apart, with MIN_GAP between the outlines.
 * A corner, or two segments that touch and open, does not count: the chord
 * cuts the vertex. Two branches that turn back, almost parallel, do.
 */
export function centerlineClearance(
  lines: readonly ClearanceLine[],
  params: Pick<Params, 'CHANNEL_W' | 'WALL' | 'MIN_GAP' | 'CORNER_MERGE_DIST' | 'CROSSING_GAP'> & { STRIP_W?: number },
  crossings: readonly Point[] = [],
): ClearanceClash | null {
  const stripW = params.STRIP_W ?? 0;
  // A zone is a continuous stretch of overlap: a point less than two limits from a point
  // already seen belongs to the same zone, and if it touches two it joins them.
  const overlapZones: Point[][] = [];
  const limit = params.CHANNEL_W + 2 * params.WALL + params.MIN_GAP;
  const joinGap = Math.max(params.CORNER_MERGE_DIST, params.CROSSING_GAP * 2 + 1.5);
  const sampled = lines
    .map((line, index) => {
      const pts = line.points;
      let length = 0;
      for (let i = 1; i < pts.length; i++) {
        length += Math.hypot(pts[i]![0] - pts[i - 1]![0], pts[i]![1] - pts[i - 1]![1]);
      }
      const closed = line.closed === true;
      return {
        index,
        closed,
        length,
        start: pts[0] ?? ([0, 0] as Point),
        end: pts[pts.length - 1] ?? ([0, 0] as Point),
        samples: arcSamples(pts, CLEARANCE_STEP, closed),
      };
    })
    .filter((line) => line.samples.length > 0);

  const byLine = new Map(sampled.map((line) => [line.index, line]));
  const flat: { p: Point; s: number; dir: [number, number]; line: number }[] = [];
  for (const line of sampled) {
    for (const sample of line.samples) flat.push({ p: sample.p, s: sample.s, dir: sample.dir, line: line.index });
  }
  const foldCos = -Math.cos((WALL_FOLD_DEG * Math.PI) / 180);

  const nearCrossing = (a: Point, b: Point): boolean => {
    for (const c of crossings) {
      if (Math.hypot(a[0] - c[0], a[1] - c[1]) <= limit && Math.hypot(b[0] - c[0], b[1] - c[1]) <= limit) return true;
    }
    return false;
  };

  const buckets = new Map<string, number[]>();
  const cellOf = (p: Point): [number, number] => [Math.floor(p[0] / limit), Math.floor(p[1] / limit)];
  for (let i = 0; i < flat.length; i++) {
    const [cx, cy] = cellOf(flat[i]!.p);
    const key = `${cx},${cy}`;
    const list = buckets.get(key);
    if (list) list.push(i);
    else buckets.set(key, [i]);
  }

  let best: ClearanceClash | null = null;
  for (let i = 0; i < flat.length; i++) {
    const a = flat[i]!;
    const A = byLine.get(a.line)!;
    const [ix, iy] = cellOf(a.p);
    for (let dx = -1; dx <= 1; dx++) {
      for (let dy = -1; dy <= 1; dy++) {
        const list = buckets.get(`${ix + dx},${iy + dy}`);
        if (!list) continue;
        for (const j of list) {
          if (j <= i) continue;
      const b = flat[j]!;
      const B = byLine.get(b.line)!;
      if (a.line === b.line) {
        let sep = Math.abs(a.s - b.s);
        if (A.closed) sep = Math.min(sep, A.length - sep);
        if (sep <= limit) continue;
        // A corner changes direction less than a return: the chord cuts the corner, it is not a second channel.
        if (a.dir[0] * b.dir[0] + a.dir[1] * b.dir[1] > foldCos) continue;
        // A stroke that crosses itself (the loop of a "d", of an "l") touches itself there by
        // design, like two different strokes that cross: around the crossing it is not a defect.
        if (nearCrossing(a.p, b.p)) continue;
      } else if (!A.closed && !B.closed) {
        let through: number | null = null;
        let jointA: Point | null = null;
        let jointB: Point | null = null;
        const endsA: { p: Point; s: number }[] = [
          { p: A.start, s: 0 },
          { p: A.end, s: A.length },
        ];
        const endsB: { p: Point; s: number }[] = [
          { p: B.start, s: 0 },
          { p: B.end, s: B.length },
        ];
        for (const ea of endsA) {
          for (const eb of endsB) {
            const gap = Math.hypot(ea.p[0] - eb.p[0], ea.p[1] - eb.p[1]);
            if (gap > joinGap) continue;
            const path = Math.abs(a.s - ea.s) + gap + Math.abs(b.s - eb.s);
            if (through === null || path < through) {
              through = path;
              jointA = ea.p;
              jointB = eb.p;
            }
          }
        }
        if (through !== null && through <= limit) continue;
        if (jointA && jointB && legsDiverge(jointA, a.p, jointB, b.p, WALL_FOLD_DEG)) continue;
        if (nearCrossing(a.p, b.p)) continue;
      } else if (nearCrossing(a.p, b.p)) {
        continue;
      }
      const d = Math.hypot(a.p[0] - b.p[0], a.p[1] - b.p[1]);
      if (d >= limit - 1e-6) continue;
      const mid: Point = [(a.p[0] + b.p[0]) / 2, (a.p[1] + b.p[1]) / 2];
      if (d < stripW - 1e-6) {
        const near = overlapZones.filter((zone) => zone.some((z) => Math.hypot(z[0] - mid[0], z[1] - mid[1]) <= 2 * limit));
        if (near.length === 0) {
          overlapZones.push([mid]);
        } else {
          near[0]!.push(mid);
          for (const other of near.slice(1)) {
            near[0]!.push(...other);
            overlapZones.splice(overlapZones.indexOf(other), 1);
          }
        }
      }
      if (best && d >= best.distance) continue;
      best = { x: mid[0], y: mid[1], distance: d, limit, overlaps: 0 };
        }
      }
    }
  }
  if (best) best.overlaps = overlapZones.length;
  return best;
}
