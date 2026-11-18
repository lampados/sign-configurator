// [D] Segmentation (SPEC §5). At a degree-4 crossing the branches are paired by
// tangent continuity: the straightest pair continues, the other is interrupted by
// CROSSING_GAP per side. At a degree-3 junction the straightest pair continues and
// the remaining branch is a segment. Disconnected components stay segments; a closed
// loop with radius under R_MIN is excluded. Pure module.

import type { GraphEdge, GraphNode } from './graph';
import type { Point } from './rasterize';

export interface SegmentOptions {
  crossingGap: number;
  /** Minimum radius of the strip: under it, the closed loop is excluded. */
  rMin: number;
}

export interface StripSegment {
  id: number;
  points: Point[];
  closed: boolean;
  lengthMm: number;
}

export interface SegmentNotice {
  kind: 'crossing' | 'excluded' | 'high-degree' | 'unlit';
  x: number;
  y: number;
  radiusMm: number | null;
  degree: number | null;
  /** Outline of the loop, if the notice is a dot. Otherwise empty. */
  points: Point[];
}

export interface SegmentGap {
  points: Point[];
  lengthMm: number;
}

export interface SegmentResult {
  segments: StripSegment[];
  notices: SegmentNotice[];
  /** Stretches removed in front of a crossing: the strip does not run along them. */
  gaps: SegmentGap[];
}

interface Port {
  edge: number;
  side: 'a' | 'b';
}

interface Arm {
  port: Port;
  tx: number;
  ty: number;
}

const TANGENT_MM = 1;

const dist = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

const key = (p: Port): string => `${p.edge}:${p.side}`;

function lengthOf(points: readonly Point[]): number {
  let l = 0;
  for (let i = 1; i < points.length; i++) l += dist(points[i - 1]!, points[i]!);
  return l;
}

function armOf(edge: GraphEdge, side: 'a' | 'b'): Arm {
  const seq = side === 'a' ? edge.points : [...edge.points].reverse();
  const origin = seq[0] ?? [0, 0];
  let acc = 0;
  let tx = 1;
  let ty = 0;
  for (let i = 1; i < seq.length; i++) {
    const prev = seq[i - 1]!;
    const q = seq[i]!;
    acc += dist(prev, q);
    const n = dist(origin, q);
    if (n > 1e-9) {
      tx = (q[0] - origin[0]) / n;
      ty = (q[1] - origin[1]) / n;
    }
    if (acc >= TANGENT_MM) break;
  }
  return { port: { edge: edge.id, side }, tx, ty };
}

/** 0 = the two branches are one the continuation of the other. */
function deviation(a: Arm, b: Arm): number {
  const dot = Math.min(1, Math.max(-1, a.tx * b.tx + a.ty * b.ty));
  return Math.abs(180 - (Math.acos(dot) * 180) / Math.PI);
}

function edgeKey(a: Arm, b: Arm): number {
  const lo = Math.min(a.port.edge, b.port.edge);
  const hi = Math.max(a.port.edge, b.port.edge);
  return lo * 1_000_000 + hi;
}

function bestPair(arms: readonly Arm[]): [number, number] {
  let bestI = 0;
  let bestJ = 1;
  let bestDev = Infinity;
  let bestKey = Infinity;
  for (let i = 0; i < arms.length; i++) {
    for (let j = i + 1; j < arms.length; j++) {
      const dev = deviation(arms[i]!, arms[j]!);
      const k = edgeKey(arms[i]!, arms[j]!);
      if (dev < bestDev - 1e-9 || (Math.abs(dev - bestDev) <= 1e-9 && k < bestKey)) {
        bestDev = dev;
        bestKey = k;
        bestI = i;
        bestJ = j;
      }
    }
  }
  return [bestI, bestJ];
}

function bestMatching(arms: readonly Arm[]): { through: [number, number]; cut: [number, number] } {
  const options: readonly [number, number, number, number][] = [
    [0, 1, 2, 3],
    [0, 2, 1, 3],
    [0, 3, 1, 2],
  ];
  let chosen: { sum: number; throughDev: number; throughKey: number; through: [number, number]; cut: [number, number] } | null =
    null;
  for (const [a, b, c, d] of options) {
    const d0 = deviation(arms[a]!, arms[b]!);
    const d1 = deviation(arms[c]!, arms[d]!);
    const first: [number, number] = [a!, b!];
    const second: [number, number] = [c!, d!];
    const firstKey = edgeKey(arms[a]!, arms[b]!);
    const secondKey = edgeKey(arms[c]!, arms[d]!);
    const throughFirst = d0 < d1 - 1e-9 || (Math.abs(d0 - d1) <= 1e-9 && firstKey <= secondKey);
    const through = throughFirst ? first : second;
    const cut = throughFirst ? second : first;
    const cand = {
      sum: d0 + d1,
      throughDev: throughFirst ? d0 : d1,
      throughKey: throughFirst ? firstKey : secondKey,
      through,
      cut,
    };
    if (
      !chosen ||
      cand.sum < chosen.sum - 1e-9 ||
      (Math.abs(cand.sum - chosen.sum) <= 1e-9 &&
        (cand.throughDev < chosen.throughDev - 1e-9 ||
          (Math.abs(cand.throughDev - chosen.throughDev) <= 1e-9 && cand.throughKey < chosen.throughKey)))
    ) {
      chosen = cand;
    }
  }
  return { through: chosen!.through, cut: chosen!.cut };
}

function cutOff(
  points: readonly Point[],
  gap: number,
  fromStart: boolean,
): { kept: Point[]; removed: Point[] } {
  if (gap <= 1e-9 || points.length < 2) return { kept: points.slice(), removed: [] };
  const seq = fromStart ? points.slice() : [...points].reverse();
  let rest = gap;
  const removed: Point[] = [seq[0]!];
  for (let i = 0; i < seq.length - 1; i++) {
    const a = seq[i]!;
    const b = seq[i + 1]!;
    const len = dist(a, b);
    if (len > rest + 1e-9) {
      const t = rest / len;
      const cut: Point = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      removed.push(cut);
      const kept = [cut, ...seq.slice(i + 1)];
      return fromStart ? { kept, removed } : { kept: [...kept].reverse(), removed: [...removed].reverse() };
    }
    rest -= len;
    removed.push(b);
  }
  return { kept: [], removed: fromStart ? removed : [...removed].reverse() };
}

function orient(points: readonly Point[], closed: boolean): Point[] {
  if (points.length < 2) return points.slice();
  if (closed) {
    const ring = dist(points[0]!, points[points.length - 1]!) <= 1e-6 ? points.slice(0, -1) : points.slice();
    if (ring.length === 0) return [];
    let best = 0;
    for (let i = 1; i < ring.length; i++) {
      const p = ring[i]!;
      const q = ring[best]!;
      if (p[0] < q[0] - 1e-9 || (Math.abs(p[0] - q[0]) <= 1e-9 && p[1] < q[1])) best = i;
    }
    const rot = [...ring.slice(best), ...ring.slice(0, best)];
    const first = rot[0]!;
    return [...rot, [first[0], first[1]]];
  }
  const a = points[0]!;
  const b = points[points.length - 1]!;
  const swap = b[0] < a[0] - 1e-9 || (Math.abs(b[0] - a[0]) <= 1e-9 && b[1] < a[1]);
  return swap ? [...points].reverse() : points.slice();
}

function centroid(points: readonly Point[]): Point {
  const ring = points.length >= 2 && dist(points[0]!, points[points.length - 1]!) <= 1e-6 ? points.slice(0, -1) : points;
  let x = 0;
  let y = 0;
  for (const p of ring) {
    x += p[0];
    y += p[1];
  }
  const n = Math.max(1, ring.length);
  return [x / n, y / n];
}

interface RawSeg {
  points: Point[];
  closed: boolean;
}

/**
 * Graph [C] → segments. Ids start from 1, from left to right and from top to bottom.
 * `sourceFromPaths` prepares the same input for the medians of hollow-tube fonts.
 */
export function segmentGraph(
  source: { nodes: readonly GraphNode[]; edges: readonly GraphEdge[] },
  options: SegmentOptions,
): SegmentResult {
  const edges = source.edges.filter((e) => e.points.length >= 2 && e.lengthMm > 1e-6);
  const byId = new Map(edges.map((e) => [e.id, e]));
  const joins = new Map<string, Port>();
  const gapsSet = new Set<string>();
  const notices: SegmentNotice[] = [];

  const link = (a: Arm, b: Arm): void => {
    joins.set(key(a.port), b.port);
    joins.set(key(b.port), a.port);
  };

  for (const node of source.nodes) {
    const arms: Arm[] = [];
    for (const e of edges) {
      if (!byId.has(e.id)) continue;
      if (e.a === node.id) arms.push(armOf(e, 'a'));
      if (e.b === node.id) arms.push(armOf(e, 'b'));
    }
    if (arms.length === 2) link(arms[0]!, arms[1]!);
    else if (arms.length === 3) {
      const [i, j] = bestPair(arms);
      link(arms[i]!, arms[j]!);
    } else if (arms.length === 4) {
      const { through, cut } = bestMatching(arms);
      link(arms[through[0]]!, arms[through[1]]!);
      gapsSet.add(key(arms[cut[0]]!.port));
      gapsSet.add(key(arms[cut[1]]!.port));
      notices.push({ kind: 'crossing', x: node.x, y: node.y, radiusMm: null, degree: 4, points: [] });
    } else if (arms.length > 4) {
      const [i, j] = bestPair(arms);
      link(arms[i]!, arms[j]!);
      notices.push({ kind: 'high-degree', x: node.x, y: node.y, radiusMm: null, degree: arms.length, points: [] });
    }
  }

  const used = new Set<number>();
  const raw: RawSeg[] = [];
  const gaps: SegmentGap[] = [];

  const append = (dst: Point[], seq: readonly Point[]): void => {
    for (let i = dst.length > 0 ? 1 : 0; i < seq.length; i++) dst.push(seq[i]!);
  };

  const trace = (start: Port): void => {
    const chunks: Point[] = [];
    let port = start;
    let end = start;
    let closed = false;
    for (let guard = 0; guard <= edges.length; guard++) {
      if (used.has(port.edge)) break;
      const edge = byId.get(port.edge);
      if (!edge) break;
      used.add(port.edge);
      const seq = port.side === 'a' ? edge.points : [...edge.points].reverse();
      append(chunks, seq);
      end = { edge: port.edge, side: port.side === 'a' ? 'b' : 'a' };
      const next = joins.get(key(end));
      if (!next) break;
      if (next.edge === start.edge && next.side === start.side) {
        closed = true;
        break;
      }
      port = next;
    }
    let points = chunks;
    if (!closed && points.length >= 2) {
      if (gapsSet.has(key(start))) {
        const cut = cutOff(points, options.crossingGap, true);
        if (cut.removed.length >= 2) gaps.push({ points: cut.removed, lengthMm: lengthOf(cut.removed) });
        points = cut.kept;
      }
      if (gapsSet.has(key(end)) && points.length >= 2) {
        const cut = cutOff(points, options.crossingGap, false);
        if (cut.removed.length >= 2) gaps.push({ points: cut.removed, lengthMm: lengthOf(cut.removed) });
        points = cut.kept;
      }
    }
    if (points.length >= 2 && lengthOf(points) > 1e-3) raw.push({ points, closed });
  };

  for (const edge of edges) {
    if (used.has(edge.id)) continue;
    const a: Port = { edge: edge.id, side: 'a' };
    const b: Port = { edge: edge.id, side: 'b' };
    if (!joins.has(key(a))) trace(a);
    else if (!joins.has(key(b))) trace(b);
    else trace(a);
  }

  const kept: StripSegment[] = [];
  for (const seg of raw) {
    const points = orient(seg.points, seg.closed);
    if (points.length < 2) continue;
    const lengthMm = lengthOf(points);
    if (seg.closed) {
      const radius = lengthMm / (2 * Math.PI);
      if (radius < options.rMin) {
        const c = centroid(points);
        notices.push({
          kind: 'excluded',
          x: c[0],
          y: c[1],
          radiusMm: radius,
          degree: null,
          points: points.map((p): Point => [p[0], p[1]]),
        });
        continue;
      }
    }
    kept.push({ id: 0, points, closed: seg.closed, lengthMm });
  }

  kept.sort((a, b) => {
    const as = a.points[0]!;
    const bs = b.points[0]!;
    return as[0] - bs[0] || bs[1] - as[1] || a.lengthMm - b.lengthMm;
  });
  kept.forEach((s, i) => {
    s.id = i + 1;
  });
  notices.sort((a, b) => b.y - a.y || a.x - b.x || a.kind.localeCompare(b.kind));
  return { segments: kept, notices, gaps };
}

const CLOSE_EPS_MM = 0.25;

/** Medians and single lines of the tubes: every path is a component, without shared nodes. */
export function sourceFromPaths(paths: readonly { points: readonly Point[] }[]): {
  nodes: GraphNode[];
  edges: GraphEdge[];
} {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  for (const path of paths) {
    if (path.points.length < 2) continue;
    const first = path.points[0]!;
    const last = path.points[path.points.length - 1]!;
    const closed = dist(first, last) <= CLOSE_EPS_MM;
    const points = closed && dist(first, last) > 1e-6 ? [...path.points, [first[0], first[1]] as Point] : path.points.slice();
    const lengthMm = lengthOf(points);
    if (lengthMm < 1e-6) continue;
    if (closed) {
      const id = nodes.length;
      nodes.push({ id, x: first[0], y: first[1], degree: 2 });
      edges.push({ id: edges.length, a: id, b: id, points, lengthMm });
    } else {
      const a = nodes.length;
      const b = a + 1;
      nodes.push({ id: a, x: first[0], y: first[1], degree: 1 });
      nodes.push({ id: b, x: last[0], y: last[1], degree: 1 });
      edges.push({ id: edges.length, a, b, points, lengthMm });
    }
  }
  return { nodes, edges };
}
