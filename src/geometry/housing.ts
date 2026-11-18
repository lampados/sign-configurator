// [H]+[I] Constant-width outer profile on the smoothed line [E] (SPEC §5).
// The chain sagitta widens only the inner side, down to WALL_MIN.
// At crossings the channel continues; the strip does not. The outline does not extend beyond the end.
import type { CrossSection, Manifold, ManifoldToplevel, Vec2 } from 'manifold-3d';
import { HOLE_CLEARANCE_MM, cornerJoints, crossingAhead, type CornerJoint } from '../export/bom';
import { totalHeight, type Params } from '../config';
import type { ChainPath } from './chain';
import { buildDiffuser } from './diffuser';
import { planChamfer, profiledBody } from './edgeProfile';
import {
  anchorBossSolid,
  anchorHoleSolid,
  placeAnchorHoles,
  cableHoleSolid,
  lipChamferSolid,
  wireHoleCenter,
  wireHoleD,
  wireHoleSection,
  wireSlotCuts,
  wireSlotSection,
  type AnchorHole,
  type SlotEnd,
} from './holes';

const RIBBON_HALF = 0.05;
const ROUND_SEGMENTS = 32;
/** Floor left between a path hole and any other hole, mm. */
const PATH_HOLE_GAP_MM = 1.5;
/** Segments per turn of the closing and opening offsets: arcs of just over 1 mm. */
const SMOOTH_SEGMENTS = 16;

export interface HousingPath extends Pick<ChainPath, 'closed' | 'lengthMm' | 'hinges'> {
  id: number;
  /** Chords [F]: needed for the sagitta. */
  points: Vec2[];
  /** Smoothed line [E]. The profile and the channel follow it. */
  smooth?: Vec2[];
  /** Dot: pill-shaped channel, two holes instead of the slots. */
  dot?: boolean;
}

export interface HousingRequest {
  paths: readonly HousingPath[];
  /** Crossing nodes: the channel goes through them, the strip does not. */
  crossings: readonly Vec2[];
  unlit: readonly { x: number; y: number; radiusMm: number; points: Vec2[] }[];
  params: Params;
}

export interface HousingHole {
  kind: 'anchor' | 'cable';
  x: number;
  y: number;
  d: number;
}

export interface HousingSlot {
  segmentId: number;
  role: 'DIN' | 'DOUT';
  points: [number, number][];
  /** Diameter, if the opening is a round hole (`WIRE_HOLE_D`); absent if it is a slot. */
  d?: number;
}

export interface HousingPocket {
  x: number;
  y: number;
  segments: [number, number];
  wireMm: 0;
  points: [number, number][];
  /** Diameter, if the opening is a round hole; absent if it is a pocket. */
  d?: number;
}

export interface HousingModel {
  /** To be freed with delete(), together with `diffuser`. */
  solid: Manifold;
  diffuser: Manifold;
  holes: {
    anchors: HousingHole[];
    cable: HousingHole | null;
    wireSlots: HousingSlot[];
    cornerPockets: HousingPocket[];
    dotWires: { segmentId: number; x: number; y: number; d: number }[];
    /** Small holes along the path (`PATH_HOLE_D`), in the channel floor. */
    pathHoles: { segmentId: number; x: number; y: number; d: number }[];
  };
  outline: [number, number][][];
  warnings: string[];
}

const lengthOf = (points: readonly Vec2[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += Math.hypot(points[i]![0] - points[i - 1]![0], points[i]![1] - points[i - 1]![1]);
  return total;
};

function pointAlong(points: readonly Vec2[], distance: number): Vec2 {
  let left = Math.max(0, Math.min(distance, lengthOf(points)));
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (left <= seg + 1e-6 || i === points.length - 1) {
      const t = seg < 1e-8 ? 0 : Math.min(1, left / seg);
      return [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    }
    left -= seg;
  }
  return points[0] ?? [0, 0];
}

function floorHole(wasm: ManifoldToplevel, at: Vec2, diameter: number, floor: number): Manifold {
  const { Manifold } = wasm;
  const radius = Math.max(diameter, 0) / 2;
  return Manifold.cylinder(Math.max(floor, 0) + 2, radius, radius, 16).translate([at[0], at[1], -1]);
}

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const unit = (a: Vec2): Vec2 => {
  const n = Math.hypot(a[0], a[1]);
  return n < 1e-9 ? [1, 0] : [a[0] / n, a[1] / n];
};
const left = (v: Vec2): Vec2 => [-v[1], v[0]];

interface Run {
  /** Line of the channel: the outline, plus a bridge towards the crossing. */
  channelLine: Vec2[];
  ends: SlotEnd[];
}

function prepareRun(path: HousingPath, line: readonly Vec2[], crossings: readonly Vec2[], gap: number): Run {
  const channelLine = line.map((p): Vec2 => [p[0], p[1]]);
  const ends: SlotEnd[] = [];
  if (path.closed || line.length < 2) return { channelLine, ends };

  const start = line[0]!;
  const end = line[line.length - 1]!;
  const startHeading = unit(sub(line[1]!, start));
  const endHeading = unit(sub(end, line[line.length - 2]!));
  const dinOut = scale(startHeading, -1);
  const doutOut: Vec2 = [endHeading[0], endHeading[1]];

  const dinBridge = crossingAhead(start, dinOut, crossings, gap);
  const doutBridge = crossingAhead(end, doutOut, crossings, gap);
  if (dinBridge) {
    const dir = unit(sub(dinBridge, start));
    channelLine.unshift(add(dinBridge, scale(dir, 0.4)));
  } else ends.push({ at: [start[0], start[1]], outward: dinOut });
  if (doutBridge) {
    const dir = unit(sub(doutBridge, end));
    channelLine.push(add(doutBridge, scale(dir, 0.4)));
  } else ends.push({ at: [end[0], end[1]], outward: doutOut });
  return { channelLine, ends };
}

function nearestIndex(points: readonly Vec2[], at: { x: number; y: number }): number {
  let best = 0;
  let bestD = Infinity;
  for (let i = 0; i < points.length; i++) {
    const p = points[i]!;
    const d = (p[0] - at.x) ** 2 + (p[1] - at.y) ** 2;
    if (d < bestD) {
      bestD = d;
      best = i;
    }
  }
  return best;
}

function innerDir(points: readonly Vec2[], index: number): Vec2 | null {
  const prev = points[index - 1];
  const next = points[index + 1];
  const cur = points[index];
  if (!prev || !next || !cur) return null;
  const tin = unit(sub(cur, prev));
  const tout = unit(sub(next, cur));
  const cross = tin[0] * tout[1] - tin[1] * tout[0];
  if (Math.abs(cross) < 1e-4) return null;
  const tangent = unit(add(tin, tout));
  const n = left(tangent);
  return cross > 0 ? n : scale(n, -1);
}

/**
 * Widening of the channel towards the inside of curves, for the chain sagitta (SPEC §5 [H]):
 * between two hinges the stiff strip cuts the curve and its inner edge leaves the channel by
 * `sagittaMm`. Along the smoothed line the widening equals the sagitta within half a pitch of every
 * hinge and drops to zero over one pitch of ramp: no step and no closed lens on the edge.
 * Returns polygons to join to the channel, one per continuous stretch and per side.
 */
function innerWidening(
  path: HousingPath,
  line: readonly Vec2[],
  halfW: number,
  budget: number,
  wallMin: number,
  pitch: number,
  warnings: string[],
): Vec2[][] {
  if (line.length < 3 || budget < 0.05) return [];
  const along: number[] = [0];
  for (let i = 1; i < line.length; i++) along.push(along[i - 1]! + Math.hypot(line[i]![0] - line[i - 1]![0], line[i]![1] - line[i - 1]![1]));
  const hinges: { s: number; extra: number; side: 1 | -1 }[] = [];
  for (const hinge of path.hinges) {
    if (hinge.sagittaMm > budget + 0.05) {
      warnings.push(
        `Inner wall under ${wallMin.toFixed(1)} mm: sagitta ${hinge.sagittaMm.toFixed(2)} mm, at (${hinge.x.toFixed(1)}, ${hinge.y.toFixed(1)}).`,
      );
    }
    const extra = Math.min(hinge.sagittaMm, budget);
    if (extra < 0.05) continue;
    const index = nearestIndex(line, hinge);
    const dir = innerDir(line, Math.min(Math.max(index, 1), line.length - 2));
    if (!dir) continue;
    const tangent = unit(sub(line[Math.min(index + 1, line.length - 1)]!, line[Math.max(index - 1, 0)]!));
    const side: 1 | -1 = dir[0] * left(tangent)[0] + dir[1] * left(tangent)[1] >= 0 ? 1 : -1;
    hinges.push({ s: along[index]!, extra, side });
  }
  if (hinges.length === 0) return [];
  const flat = pitch / 2;
  const ramp = Math.max(pitch, 1);
  const polys: Vec2[][] = [];
  for (const side of [1, -1] as const) {
    const own = hinges.filter((h) => h.side === side);
    if (own.length === 0) continue;
    const extraAt = line.map((_, i) => {
      let best = 0;
      for (const h of own) {
        const d = Math.abs(along[i]! - h.s);
        const k = d <= flat ? 1 : d >= flat + ramp ? 0 : 1 - (d - flat) / ramp;
        best = Math.max(best, h.extra * k);
      }
      return best;
    });
    let run: number[] = [];
    const flush = (): void => {
      if (run.length >= 2) {
        const outer: Vec2[] = [];
        const inner: Vec2[] = [];
        for (const i of run) {
          const prev = line[Math.max(i - 1, 0)]!;
          const next = line[Math.min(i + 1, line.length - 1)]!;
          const n = scale(left(unit(sub(next, prev))), side);
          // It starts a little inside the channel, so the polygon welds without slits.
          inner.push(add(line[i]!, scale(n, halfW - 0.3)));
          outer.push(add(line[i]!, scale(n, halfW + extraAt[i]!)));
        }
        polys.push([...inner, ...outer.reverse()]);
      }
      run = [];
    };
    for (let i = 0; i < line.length; i++) {
      if (extraAt[i]! > 0.01) run.push(i);
      else flush();
    }
    flush();
  }
  return polys;
}

/** Thin ribbon around the polyline, then inflated with an offset. */
function ribbon(points: readonly Vec2[], ribbonHalf: number): Vec2[] {
  const right: Vec2[] = [];
  const leftSide: Vec2[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    const tIn = prev ? unit(sub(p, prev)) : undefined;
    const tOut = next ? unit(sub(next, p)) : undefined;
    const n1 = left(tIn ?? tOut ?? [1, 0]);
    const n2 = left(tOut ?? tIn ?? [1, 0]);
    const mid = unit(add(n1, n2));
    const denom = n1[0] * mid[0] + n1[1] * mid[1];
    const n = scale(mid, ribbonHalf / (Math.abs(denom) < 1e-6 ? 1 : denom));
    right.push(sub(p, n));
    leftSide.push(add(p, n));
  });
  return [...right, ...leftSide.reverse()];
}

/** Offset with rounded joins and ends of the centreline. */
export function offsetCenterline(wasm: ManifoldToplevel, points: readonly Vec2[], radius: number): CrossSection {
  const { CrossSection } = wasm;
  const band = new CrossSection([ribbon(points, RIBBON_HALF)], 'NonZero');
  const grown = band.offset(Math.max(radius - RIBBON_HALF, 0.02), 'Round', 2, ROUND_SEGMENTS);
  band.delete();
  return grown;
}

/**
 * Morphological closing of the channel: fills holes and notches narrower than `minWidth`, that is the
 * tips and islands of wall too thin to be printed.
 * - On tight curves an inner band limited by the wall budget touches the channel at the
 *   ends of the chord but not in the middle: a thin lens stays closed (a pillar in the channel,
 *   a slit in the diffuser).
 * - At crossings and junctions the two channels leave pointed wedges of wall between them, which
 *   show in the diffuser as dark notches.
 * A real wall between two non-adjacent channels is at least 2·WALL + MIN_GAP wide (under that, sending is
 * already blocked for merging), much more than `minWidth`; the outer wall borders the outside, which
 * is wide, and the closing does not touch it. The result stays inside `outline`. It does not free the inputs.
 */
export function closeChannel(
  wasm: ManifoldToplevel,
  section: CrossSection,
  outline: CrossSection,
  minWidth: number,
): CrossSection {
  const r = minWidth / 2;
  if (!(r > 0) || section.isEmpty()) return section;
  // Closing (+r, −r) and opening (−r, +r) in a row: the two central −r become a single one of 2r.
  // The opening rounds outward corners, so the start and end of a widening leave no
  // steps. The channel is at least CHANNEL_W wide, much more than `minWidth`.
  const grown = section.offset(r, 'Round', 2, SMOOTH_SEGMENTS);
  const shrunk = grown.offset(-2 * r, 'Round', 2, SMOOTH_SEGMENTS);
  grown.delete();
  const smoothed = shrunk.offset(r, 'Round', 2, SMOOTH_SEGMENTS);
  shrunk.delete();
  const clipped = smoothed.intersect(outline);
  smoothed.delete();
  return clipped;
}

function contoursOf(section: CrossSection): [number, number][][] {
  return section.toPolygons().map((poly) => poly.map((p) => [p[0], p[1]] as [number, number]));
}

/** Nonzero, like the manifold cross-section: the point is inside the grown footprint of the openings. */
function insideOpenings(polys: readonly Vec2[][], x: number, y: number): boolean {
  let winding = 0;
  for (const poly of polys) {
    const n = poly.length;
    for (let i = 0, j = n - 1; i < n; j = i++) {
      const ax = poly[j]![0];
      const ay = poly[j]![1];
      const bx = poly[i]![0];
      const by = poly[i]![1];
      if ((ay > y) !== (by > y)) {
        const xAt = ax + ((bx - ax) * (y - ay)) / (by - ay);
        if (x < xAt) winding += by > ay ? 1 : -1;
      }
    }
  }
  return winding !== 0;
}

/** true if (x, y) falls in the 10 mm around slots or pockets. To be freed with delete(). */
function openingOccupies(wasm: ManifoldToplevel, openings: readonly Vec2[][]): { hits(x: number, y: number): boolean; delete(): void } {
  const polys = openings.filter((poly) => poly.length >= 3);
  if (polys.length === 0) return { hits: () => false, delete: () => {} };
  const { CrossSection } = wasm;
  const shape = new CrossSection(polys, 'NonZero');
  const grown = shape.offset(HOLE_CLEARANCE_MM - 0.05, 'Round', 2, 24);
  shape.delete();
  const region = contoursOf(grown);
  grown.delete();
  return {
    hits(x: number, y: number): boolean {
      return insideOpenings(region, x, y);
    },
    delete(): void {},
  };
}

function pocketSection(wasm: ManifoldToplevel, channel: CrossSection, joint: CornerJoint, p: Params): CrossSection {
  const { CrossSection } = wasm;
  // With round holes the corner joint has a single one, at the vertex: the two ends are soldered there.
  const holeD = wireHoleD(p);
  if (holeD > 0) return wireHoleSection(wasm, channel, [joint.x, joint.y], holeD);
  const wide = { ...p, WIRE_SLOT_W: p.CHANNEL_W };
  const sections = joint.ends.map((end) =>
    wireSlotSection(wasm, channel, { at: end.at, outward: end.outward }, wide),
  );
  let pocket = sections.length > 0 ? CrossSection.union(sections) : new CrossSection([]);
  for (const section of sections) section.delete();
  if (pocket.toPolygons().length > 1) {
    const disk = CrossSection.circle(p.CHANNEL_W / 2, ROUND_SEGMENTS).translate([joint.x, joint.y]);
    const joined = CrossSection.union([pocket, disk]);
    pocket.delete();
    disk.delete();
    pocket = joined;
  }
  const clipped = pocket.intersect(channel);
  pocket.delete();
  return clipped;
}

function unlitSolid(wasm: ManifoldToplevel, dot: HousingRequest['unlit'][number], height: number): Manifold | null {
  const { CrossSection, Manifold } = wasm;
  if (dot.points.length >= 3) {
    const section = new CrossSection([dot.points], 'NonZero');
    const solid = section.extrude(height);
    section.delete();
    return solid;
  }
  if (!(dot.radiusMm > 0.2)) return null;
  const section = CrossSection.circle(dot.radiusMm, ROUND_SEGMENTS).translate([dot.x, dot.y]);
  const solid = section.extrude(height);
  section.delete();
  if (solid.volume() <= 1e-6) {
    solid.delete();
    return Manifold.cube([0, 0, 0]);
  }
  return solid;
}

export function buildHousing(wasm: ManifoldToplevel, request: HousingRequest): HousingModel {
  const { CrossSection, Manifold } = wasm;
  const p = request.params;
  const warnings: string[] = [];
  const temps: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(x: T): T => (temps.push(x), x);

  const chamfer = planChamfer(p);
  warnings.push(...chamfer.warnings);
  if (p.ANCHOR_HOLE_DEPTH >= p.FLOOR && !p.ANCHOR_BOSS) {
    warnings.push(
      `ANCHOR_HOLE_DEPTH ${p.ANCHOR_HOLE_DEPTH.toFixed(1)} mm reaches the channel: the hole stays blind in the floor.`,
    );
  }

  let anchors: AnchorHole[] = [];
  const pendingSlots: { segmentId: number; role: 'DIN' | 'DOUT'; end: SlotEnd }[] = [];
  const dotWires: { segmentId: number; x: number; y: number }[] = [];
  let cableAt: Vec2 | null = null;
  let firstId = Infinity;

  try {
    const channelParts: CrossSection[] = [];
    const outlineParts: CrossSection[] = [];
    const silhouette: Vec2[][] = [];
    const halfW = p.CHANNEL_W / 2;
    const budget = Math.max(0, p.WALL - p.WALL_MIN);
    for (const path of request.paths) {
      const line = path.smooth && path.smooth.length >= 2 ? path.smooth : path.points;
      if (line.length < 2) {
        silhouette.push([]);
        continue;
      }
      if (path.id < firstId) firstId = path.id;
      silhouette.push(line);
      const run = prepareRun(path, line, request.crossings, p.CROSSING_GAP);
      outlineParts.push(keep(offsetCenterline(wasm, line, halfW + p.WALL)));
      channelParts.push(keep(offsetCenterline(wasm, run.channelLine, halfW)));
      for (const poly of innerWidening(path, line, halfW, budget, p.WALL_MIN, p.HINGE_PITCH, warnings)) {
        channelParts.push(keep(new CrossSection([poly], 'NonZero')));
      }
      if (path.dot && line.length >= 2) {
        const inset = p.DOT_WIRE_HOLE_D / 2 + 0.35;
        for (const at of [pointAlong(line, inset), pointAlong(line, Math.max(inset, lengthOf(line) - inset))]) {
          dotWires.push({ segmentId: path.id, x: at[0], y: at[1] });
        }
      }
      if (!path.closed && !path.dot) {
        const start = line[0]!;
        for (const end of run.ends) {
          const role: 'DIN' | 'DOUT' =
            Math.hypot(end.at[0] - start[0], end.at[1] - start[1]) < 1e-4 ? 'DIN' : 'DOUT';
          pendingSlots.push({ segmentId: path.id, role, end });
        }
      }
    }

    const joints = cornerJoints(
      pendingSlots.map((slot) => ({
        segmentId: slot.segmentId,
        role: slot.role,
        at: slot.end.at,
        outward: slot.end.outward,
      })),
      request.crossings,
      p,
    );
    const joined = new Set(joints.flatMap((joint) => joint.ends.map((end) => `${end.segmentId}:${end.role}`)));
    const freeSlots = pendingSlots.filter((slot) => !joined.has(`${slot.segmentId}:${slot.role}`));
    const channelUnion = channelParts.length > 0 ? CrossSection.union(channelParts) : new CrossSection([]);
    const rawChannel = channelUnion.simplify(0.001);
    if (rawChannel !== channelUnion) channelUnion.delete();
    const outlineUnion = outlineParts.length > 0 ? CrossSection.union(outlineParts) : new CrossSection([]);
    const outline = keep(outlineUnion.simplify(0.001));
    if (outline !== outlineUnion) outlineUnion.delete();
    const clipped = rawChannel.intersect(outline);
    if (rawChannel !== clipped) rawChannel.delete();
    const channel = keep(closeChannel(wasm, clipped, outline, 2 * p.WALL_MIN));
    if (channel !== clipped) clipped.delete();
    const slots: HousingSlot[] = [];
    const wide = { ...p, WIRE_SLOT_W: p.CHANNEL_W };
    const roundD = wireHoleD(p);
    for (const pending of freeSlots) {
      const section = keep(wireSlotSection(wasm, channel, pending.end, wide));
      for (const points of contoursOf(section)) {
        if (points.length >= 3) slots.push({ segmentId: pending.segmentId, role: pending.role, points, ...(roundD > 0 ? { d: roundD } : {}) });
      }
    }
    const cornerPockets: HousingPocket[] = [];
    const pocketCuts: Manifold[] = [];
    for (const joint of joints) {
      const section = keep(pocketSection(wasm, channel, joint, p));
      for (const points of contoursOf(section)) {
        if (points.length >= 3) {
          cornerPockets.push({ x: joint.x, y: joint.y, segments: joint.segments, wireMm: 0, points, ...(roundD > 0 ? { d: roundD } : {}) });
        }
      }
      if (section.area() > 1e-8) {
        const extruded = section.extrude(p.FLOOR + 2);
        const hole = extruded.translate([0, 0, -1]);
        if (hole !== extruded) extruded.delete();
        pocketCuts.push(keep(hole));
      }
      for (const end of joint.ends) {
        const lip = lipChamferSolid(wasm, { at: end.at, outward: end.outward }, wide);
        if (lip) pocketCuts.push(keep(lip));
      }
    }

    const blocked = openingOccupies(wasm, [...slots, ...cornerPockets].map((opening) => opening.points));
    try {
      for (let i = 0; i < request.paths.length; i++) {
        const path = request.paths[i]!;
        const line = silhouette[i];
        if (!line || line.length < 2 || request.paths[i]!.dot) continue;
        const placed = placeAnchorHoles(line, p, {
          crossings: request.crossings,
          occupies: (x, y) => blocked.hits(x, y),
          segmentId: path.id,
          endClear: path.closed ? 0 : p.WIRE_SLOT_L,
        });
        anchors.push(...placed.holes);
        warnings.push(...placed.warnings);
      }
    } finally {
      blocked.delete();
    }

    const first = request.paths.find((path) => path.id === firstId && path.points.length > 0);
    if (first) cableAt = first.points[0] ?? null;
    // If the first segment starts with a hole at least as large as that of the cable, the cable
    // goes through it: a second hole next to it would only make a figure-eight slot.
    const firstEnd = freeSlots.find((slot) => slot.segmentId === firstId && slot.role === 'DIN');
    if (cableAt && firstEnd && wireHoleD(p) >= p.CABLE_HOLE_D) cableAt = wireHoleCenter(firstEnd.end, p.WIRE_SLOT_L);

    // Small holes along the whole path. They come after the others and give way to them: they do not
    // crowd the large holes at the ends, the anchors, the cable, the crossings, or each other.
    const pathHoles: { segmentId: number; x: number; y: number; d: number }[] = [];
    const pathD = p.PATH_HOLE_D > 0 && p.PATH_HOLE_PITCH > 0 ? Math.min(p.PATH_HOLE_D, p.CHANNEL_W) : 0;
    if (pathD > 0) {
      const endD = wireHoleD(p);
      const keepOut: { x: number; y: number; r: number }[] = [];
      for (const slot of freeSlots) {
        const [x, y] = endD > 0 ? wireHoleCenter(slot.end, p.WIRE_SLOT_L) : slot.end.at;
        keepOut.push({ x, y, r: (endD > 0 ? endD : p.CHANNEL_W) / 2 });
      }
      for (const joint of joints) keepOut.push({ x: joint.x, y: joint.y, r: (endD > 0 ? endD : p.CHANNEL_W) / 2 });
      const anchorD = p.ANCHOR_BOSS ? Math.max(p.ANCHOR_BOSS_D, p.ANCHOR_HOLE_D) : p.ANCHOR_HOLE_D;
      for (const hole of anchors) keepOut.push({ x: hole.x, y: hole.y, r: anchorD / 2 });
      for (const hole of dotWires) keepOut.push({ x: hole.x, y: hole.y, r: p.DOT_WIRE_HOLE_D / 2 });
      if (cableAt && p.CABLE_HOLE_D > 0) keepOut.push({ x: cableAt[0], y: cableAt[1], r: p.CABLE_HOLE_D / 2 });
      for (const crossing of request.crossings) keepOut.push({ x: crossing[0], y: crossing[1], r: p.CHANNEL_W / 2 });
      const free = (x: number, y: number): boolean =>
        keepOut.every((zone) => Math.hypot(x - zone.x, y - zone.y) >= zone.r + pathD / 2 + PATH_HOLE_GAP_MM);
      for (let i = 0; i < request.paths.length; i++) {
        const path = request.paths[i]!;
        const line = silhouette[i];
        if (!line || line.length < 2 || path.dot) continue;
        const length = lengthOf(line);
        // An open path starts and ends with the large hole: the small ones sit in between.
        const margin = path.closed ? 0 : p.WIRE_SLOT_L;
        const usable = length - 2 * margin;
        const count = path.closed ? Math.round(length / p.PATH_HOLE_PITCH) : Math.floor(usable / p.PATH_HOLE_PITCH);
        if (count < 1 || usable <= 0) continue;
        const step = usable / count;
        for (let k = 0; k < count; k++) {
          const [x, y] = pointAlong(line, margin + step * (path.closed ? k : k + 0.5));
          if (!free(x, y)) continue;
          pathHoles.push({ segmentId: path.id, x, y, d: pathD });
          keepOut.push({ x, y, r: pathD / 2 });
        }
      }
    }

    const outlinePolys = contoursOf(outline);
    const height = totalHeight(p);
    let body = keep(profiledBody(wasm, outline, channel, height, chamfer));
    const bosses = p.ANCHOR_BOSS ? anchors.map((hole) => keep(anchorBossSolid(wasm, hole, p))) : [];
    if (bosses.length > 0) {
      const grown = keep(Manifold.union([body, ...bosses]));
      body = grown;
    }
    const pocket = keep(channel.extrude(p.CHANNEL_DEPTH + 1).translate([0, 0, p.FLOOR]));
    const anchorCuts = anchors
      .filter(() => p.ANCHOR_HOLE_D > 0)
      .map((hole) => keep(anchorHoleSolid(wasm, hole, p)));
    const slotCuts = wireSlotCuts(wasm, channel, freeSlots.map((slot) => slot.end), wide).map((cut) => keep(cut));
    const cable = cableAt && p.CABLE_HOLE_D > 0 ? keep(cableHoleSolid(wasm, cableAt, p)) : null;
    const dotCuts = dotWires.map((hole) => keep(floorHole(wasm, [hole.x, hole.y], p.DOT_WIRE_HOLE_D, p.FLOOR)));
    const pathCuts = pathHoles.map((hole) => keep(floorHole(wasm, [hole.x, hole.y], hole.d, p.FLOOR)));
    const cuts = [pocket, ...anchorCuts, ...slotCuts, ...pocketCuts, ...dotCuts, ...pathCuts, ...(cable ? [cable] : [])];
    let solid = body;
    if (cuts.length === 1) solid = Manifold.difference([body, cuts[0]!]);
    else if (cuts.length > 1) {
      const tool = Manifold.union(cuts);
      solid = Manifold.difference([body, tool]);
      tool.delete();
    }

    const reliefs = request.unlit
      .map((dot) => unlitSolid(wasm, dot, height))
      .filter((m): m is Manifold => m !== null)
      .map((m) => keep(m));
    if (reliefs.length > 0) {
      const merged = Manifold.union([solid, ...reliefs]);
      if (merged !== solid && solid !== body) solid.delete();
      solid = merged;
    }
    const tracked = temps.indexOf(solid);
    if (tracked >= 0) temps.splice(tracked, 1);

    const diffuser = buildDiffuser(wasm, channel, p);

    return {
      solid,
      diffuser,
      holes: {
        anchors: anchors.map((hole) => ({ kind: 'anchor', x: hole.x, y: hole.y, d: p.ANCHOR_HOLE_D })),
        cable: cableAt ? { kind: 'cable', x: cableAt[0], y: cableAt[1], d: p.CABLE_HOLE_D } : null,
        wireSlots: slots,
        cornerPockets,
        dotWires: dotWires.map((hole) => ({ ...hole, d: p.DOT_WIRE_HOLE_D })),
        pathHoles,
      },
      outline: outlinePolys,
      warnings,
    };
  } finally {
    for (const t of temps) t.delete();
  }
}
