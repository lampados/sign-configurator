// Anchor, wire and cable holes (SPEC §5 "Holes").
// The wires leave through a round hole (WIRE_HOLE_D) at each end of a segment, halfway along the last
// WIRE_SLOT_L: it sits inside the channel, so the floor stays under the walls and the part is in one piece.
// With WIRE_HOLE_D 0 the slot of before comes back: it takes the last WIRE_SLOT_L of the segment and the
// rounded end, same shape as the floor, through, with a 45° chamfer on the lip.
import type { CrossSection, Manifold, ManifoldToplevel, Mat4, Vec2 } from 'manifold-3d';
import type { Params } from '../config';
import { HOLE_CLEARANCE_MM, anchorStations } from '../export/bom';

export type WireSlotParams = Pick<
  Params,
  'CHANNEL_W' | 'WIRE_SLOT_W' | 'WIRE_SLOT_L' | 'FLOOR' | 'SLOT_LIP_CHAMFER'
> & { WIRE_HOLE_D?: number };

const WIRE_HOLE_SEGMENTS = 32;

/** Diameter of the round wire hole: 0 if the slot is used. Never wider than the channel. */
export function wireHoleD(p: { WIRE_HOLE_D?: number; CHANNEL_W: number }): number {
  const d = p.WIRE_HOLE_D ?? 0;
  return d > 0 ? Math.min(d, p.CHANNEL_W) : 0;
}

/** Centre of the wire hole: halfway along the stretch without strip, between the lip and the end. */
export function wireHoleCenter(end: SlotEnd, slotL: number): Vec2 {
  return add(end.at, scale(end.outward, -Math.max(slotL, 0) / 2));
}

/** Disc of diameter `d` at `at`, clipped to the channel. */
export function wireHoleSection(wasm: ManifoldToplevel, channel: CrossSection, at: Vec2, d: number): CrossSection {
  const disk = wasm.CrossSection.circle(d / 2, WIRE_HOLE_SEGMENTS).translate(at);
  const hole = channel.intersect(disk);
  disk.delete();
  return hole;
}

/** End of a segment. `outward` is a unit vector and points towards the end wall. */
export interface SlotEnd {
  at: Vec2;
  outward: Vec2;
}

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const left = (v: Vec2): Vec2 => [-v[1], v[0]];

/** Inner lip: where the lit part ends, WIRE_SLOT_L back from the end. */
export function slotLip(end: SlotEnd, slotL: number): Vec2 {
  return add(end.at, scale(end.outward, -slotL));
}

/**
 * A window on the end, not a half-plane: the rest of the path can fold back
 * on the same side without entering the slot.
 */
function endWindow(lip: Vec2, outward: Vec2, reach: number, halfWidth: number): Vec2[] {
  const side = scale(left(outward), halfWidth);
  const far = scale(outward, reach);
  return [
    add(lip, side),
    add(add(lip, far), side),
    add(add(lip, far), scale(side, -1)),
    add(lip, scale(side, -1)),
  ];
}

function widthStrip(lip: Vec2, outward: Vec2, width: number, reach: number): Vec2[] {
  return endWindow(add(lip, scale(outward, -1)), outward, reach + 1, width / 2);
}

/** Plan outline of the slot: channel ∩ window on the end. */
export function wireSlotSection(
  wasm: ManifoldToplevel,
  channel: CrossSection,
  end: SlotEnd,
  p: Pick<WireSlotParams, 'CHANNEL_W' | 'WIRE_SLOT_W' | 'WIRE_SLOT_L' | 'WIRE_HOLE_D'>,
): CrossSection {
  const { CrossSection } = wasm;
  const holeD = wireHoleD(p);
  if (holeD > 0) return wireHoleSection(wasm, channel, wireHoleCenter(end, p.WIRE_SLOT_L), holeD);
  const lip = slotLip(end, p.WIRE_SLOT_L);
  const reach = p.WIRE_SLOT_L + p.CHANNEL_W;
  const gate = new CrossSection([endWindow(lip, end.outward, reach, p.CHANNEL_W)], 'NonZero');
  let slot = channel.intersect(gate);
  gate.delete();
  const width = Math.min(p.WIRE_SLOT_W, p.CHANNEL_W);
  if (width < p.CHANNEL_W - 1e-6) {
    const band = new CrossSection([widthStrip(lip, end.outward, width, reach)], 'NonZero');
    const narrower = slot.intersect(band);
    slot.delete();
    band.delete();
    slot = narrower;
  }
  return slot;
}

/**
 * Prism of the 45° chamfer on the lip, segment side.
 * In plan local X = towards the segment, local Y = world Z. It removes only the top
 * rim of the floor: the through hole in plan stays the outline of the slot.
 */
export function lipChamferSolid(wasm: ManifoldToplevel, end: SlotEnd, p: WireSlotParams): Manifold | null {
  // With the round hole the strip does not go down from the floor: there is no lip to chamfer.
  if (wireHoleD(p) > 0) return null;
  const size = Math.min(Math.max(p.SLOT_LIP_CHAMFER, 0), p.FLOOR);
  if (size < 1e-6) return null;
  const { CrossSection } = wasm;
  const lip = slotLip(end, p.WIRE_SLOT_L);
  const inward = scale(end.outward, -1);
  const across = left(inward);
  const span = Math.min(p.WIRE_SLOT_W, p.CHANNEL_W) + 0.2;
  // −0.05 towards the slot and +0.05 above the floor: coincident faces do not stay in the boolean.
  const eps = 0.05;
  const z0 = p.FLOOR - size;
  const profile: Vec2[] = [
    [-eps, z0],
    [0, z0],
    [size, p.FLOOR],
    [size, p.FLOOR + eps],
    [-eps, p.FLOOR + eps],
  ];
  const section = new CrossSection([profile], 'NonZero');
  const extruded = section.extrude(span);
  section.delete();
  // translate returns a new solid: without using it the prism stays on one side only and pierces the wall.
  const centered = extruded.translate([0, 0, -span / 2]);
  if (centered !== extruded) extruded.delete();
  const m: Mat4 = [
    inward[0], inward[1], 0, 0,
    0, 0, 1, 0,
    across[0], across[1], 0, 0,
    lip[0], lip[1], 0, 1,
  ];
  const placed = centered.transform(m);
  if (placed !== centered) centered.delete();
  return placed;
}

export interface AnchorHole {
  x: number;
  y: number;
  /** Distance from the DIN along the segment, mm. */
  along: number;
}

const lengthOf = (points: readonly Vec2[]): number => {
  let total = 0;
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    total += Math.hypot(b[0] - a[0], b[1] - a[1]);
  }
  return total;
};

function pointAt(points: readonly Vec2[], distance: number): Vec2 {
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
  return points[points.length - 1] ?? [0, 0];
}

export interface AnchorPlacement {
  holes: AnchorHole[];
  warnings: string[];
}

/**
 * Anchor holes on the centreline. If a station intersects a slot, a pocket
 * or a crossing, the hole moves along the path to the nearest valid point
 * (always ≥ 10 mm from ends, obstacles and other holes). If fewer than
 * ANCHOR_MIN_PER_SEGMENT are left, the warning carries the position of the segment.
 */
export function placeAnchorHoles(
  points: readonly Vec2[],
  params: Pick<Params, 'ANCHOR_SPACING' | 'ANCHOR_MIN_PER_SEGMENT' | 'WIRE_SLOT_L'>,
  opts: {
    crossings?: readonly Vec2[];
    /** true if (x, y) is less than 10 mm from a slot or a pocket. */
    occupies?: (x: number, y: number) => boolean;
    segmentId?: number;
    /** Mm of slot to leave extra at the ends. 0 on a closed loop. */
    endClear?: number;
  } = {},
): AnchorPlacement {
  const length = lengthOf(points);
  const endClear = opts.endClear ?? params.WIRE_SLOT_L;
  const margin = HOLE_CLEARANCE_MM + endClear;
  const targets = anchorStations(length, { ...params, WIRE_SLOT_L: endClear });
  const crossings = opts.crossings ?? [];
  const taken: number[] = [];
  const blocked = (t: number): boolean => {
    if (t < margin - 1e-6 || t > length - margin + 1e-6) return true;
    if (taken.some((u) => Math.abs(u - t) < HOLE_CLEARANCE_MM - 1e-6)) return true;
    const at = pointAt(points, t);
    if (crossings.some((c) => Math.hypot(c[0] - at[0], c[1] - at[1]) < HOLE_CLEARANCE_MM - 1e-6)) return true;
    return opts.occupies?.(at[0], at[1]) ?? false;
  };
  const nearest = (target: number): number | null => {
    if (!blocked(target)) return target;
    let best: number | null = null;
    let bestDist = Infinity;
    for (let t = margin; t <= length - margin + 1e-6; t += 0.5) {
      if (blocked(t)) continue;
      const dist = Math.abs(t - target);
      if (dist < bestDist - 1e-9) {
        bestDist = dist;
        best = t;
      }
    }
    return best;
  };
  const holes: AnchorHole[] = [];
  for (const target of targets) {
    const along = nearest(target);
    if (along === null) continue;
    const at = pointAt(points, along);
    holes.push({ x: at[0], y: at[1], along });
    taken.push(along);
  }
  const warnings: string[] = [];
  if (holes.length < params.ANCHOR_MIN_PER_SEGMENT) {
    const mid = pointAt(points, length / 2);
    const id = opts.segmentId ?? 0;
    warnings.push(
      `Segment ${id}: ${holes.length} anchor holes out of ${params.ANCHOR_MIN_PER_SEGMENT} required, at (${mid[0].toFixed(1)}, ${mid[1].toFixed(1)}).`,
    );
  }
  return { holes, warnings };
}

/** Stations of the BOM, moved if they fall on a crossing or on a point to avoid. */
export function anchorHolesAlong(
  points: readonly Vec2[],
  crossings: readonly Vec2[],
  params: Pick<Params, 'ANCHOR_SPACING' | 'ANCHOR_MIN_PER_SEGMENT' | 'WIRE_SLOT_L'>,
  /** Lips of pockets and other points to stay at least 10 mm from. */
  avoid: readonly Vec2[] = [],
): AnchorHole[] {
  return placeAnchorHoles(points, params, { crossings: [...crossings, ...avoid] }).holes;
}

const HOLE_SEGMENTS = 20;

/** Blind cylinder from the back. With bosses it starts from the back of the standoff. */
export function anchorHoleSolid(
  wasm: ManifoldToplevel,
  hole: AnchorHole,
  p: Pick<Params, 'ANCHOR_HOLE_D' | 'ANCHOR_HOLE_DEPTH' | 'ANCHOR_BOSS' | 'ANCHOR_BOSS_H' | 'FLOOR'>,
): Manifold {
  const { Manifold } = wasm;
  const radius = Math.max(p.ANCHOR_HOLE_D, 0) / 2;
  const depth = Math.max(p.ANCHOR_HOLE_DEPTH, 0);
  const from = p.ANCHOR_BOSS ? -Math.max(p.ANCHOR_BOSS_H, 0) : 0;
  const top = Math.min(from + depth, Math.max(p.FLOOR - 0.4, from));
  const height = Math.max(top - from, 0) + 0.1;
  return Manifold.cylinder(height, radius, radius, HOLE_SEGMENTS).translate([hole.x, hole.y, from - 0.1]);
}

/** Standoff on the back, centred on the hole. */
export function anchorBossSolid(
  wasm: ManifoldToplevel,
  hole: AnchorHole,
  p: Pick<Params, 'ANCHOR_BOSS_D' | 'ANCHOR_BOSS_H'>,
): Manifold {
  const { Manifold } = wasm;
  const radius = Math.max(p.ANCHOR_BOSS_D, 0) / 2;
  const height = Math.max(p.ANCHOR_BOSS_H, 0);
  return Manifold.cylinder(height + 0.15, radius, radius, HOLE_SEGMENTS).translate([hole.x, hole.y, -height]);
}

/** Through hole of the cable, at the start of the first segment. */
export function cableHoleSolid(
  wasm: ManifoldToplevel,
  at: Vec2,
  p: Pick<Params, 'CABLE_HOLE_D' | 'FLOOR'>,
): Manifold {
  const { Manifold } = wasm;
  const radius = Math.max(p.CABLE_HOLE_D, 0) / 2;
  return Manifold.cylinder(p.FLOOR + 2, radius, radius, HOLE_SEGMENTS).translate([at[0], at[1], -1]);
}

/** Solids to subtract from the floor: through slot and lip chamfer, for every end. */
export function wireSlotCuts(
  wasm: ManifoldToplevel,
  channel: CrossSection,
  ends: readonly SlotEnd[],
  p: WireSlotParams,
): Manifold[] {
  const cuts: Manifold[] = [];
  for (const end of ends) {
    const section = wireSlotSection(wasm, channel, end, p);
    if (section.area() > 1e-8) {
      const extruded = section.extrude(p.FLOOR + 2);
      const hole = extruded.translate([0, 0, -1]);
      if (hole !== extruded) extruded.delete();
      cuts.push(hole);
      const lip = lipChamferSolid(wasm, end, p);
      if (lip) cuts.push(lip);
    }
    section.delete();
  }
  return cuts;
}
