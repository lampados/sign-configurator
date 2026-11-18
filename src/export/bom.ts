// [J] Bill of materials (SPEC §5, BOM). LEDs and cut use the lit part:
// the segment minus a WIRE_SLOT_L slot at each end. Holes sit at least 10 mm
// from the lip, from crossings and from each other, at ANCHOR_SPACING pitch, and in any case at least
// ANCHOR_MIN_PER_SEGMENT if they fit.
// Two neighbouring DIN/DOUT slots become a pocket: the wire between the segments is 0 mm. Pure module.

import { controllerAmps, controllerOf, STRIP_VOLTAGES } from '../config';
import { DOT_LED_COUNT } from '../geometry/lights';
import { BOX_AUTO, boxesThatFit, CONTROLLER_FALLBACK_MM, pickBox, type BoxItem } from '../parts/boxes';
import { pickSupply, SUPPLIES } from '../parts/supplies';
import type { ChainPath } from '../geometry/chain';
import type { Point } from '../geometry/rasterize';
import type { Params } from '../config';

/** Minimum distance of a hole from slots, pockets, crossings and other holes (SPEC §5, Holes). */
export const HOLE_CLEARANCE_MM = 10;

export interface BomSegment {
  id: number;
  lengthMm: number;
  ledCount: number;
  cutLengthMm: number;
  din: [number, number];
  dout: [number, number];
  dinDir: [number, number];
  doutDir: [number, number];
}

export interface Bom {
  segments: BomSegment[];
  totalLeds: number;
  anchorHoles: number;
  wireSlots: number;
  /** Width of the slot, by default equal to the channel. */
  wireSlotW: number;
  /** Length of the slot from the end wall to the lip. */
  wireSlotL: number;
  /** Corner joints: the two slots are a single pocket and the wire is 0 mm. */
  corners: BomCorner[];
  /** Assembly summary. */
  assembly: BomAssembly;
  warnings: string[];
}

export interface BomAssembly {
  /**
   * Cuts on bends of a strip that does not bend sideways: between two consecutive cut units the
   * strip is cut and reconnected. 0 for strips that follow curves.
   */
  bendCuts: number;
  /** Wire jumpers where two strokes are closer than the width of the strip. */
  jumpers: number;
  /** Assembly time of cuts on bends and jumpers, minutes: `assemblyMinutes` in `src/config.ts`. */
  assemblyMin: number;
  segments: number;
  /** DIN/DOUT connections to solder. Corner joints do not count. */
  solderJoints: number;
  /** 3 wires per connection. */
  wires: number;
  corners: number;
  /** Estimated metres of wire. */
  wireM: number;
  totalLeds: number;
  /** Voltage of the strip and of the power supply, V. */
  voltageV: number;
  /** Current at the strip voltage, full white. */
  maxCurrentA: number;
  /** Recommended power supply, amperes at the strip voltage. */
  supplyA: number;
  /** Model recommended from the catalogue (`pickSupply`); null if none holds `supplyA`. */
  supply: BomSupply | null;
  /** Box for power supply (if panel-mount) and controller; null if not needed or "none". */
  box: BomBox | null;
  /** Box too small, or none in the catalogue is enough. */
  boxWarnings: string[];
  /** Ids of the catalogue boxes that hold the components, for the menu. */
  boxesThatFit: string[];
  /** Chosen controller, id from `CONTROLLERS`. */
  controller: string;
  /** Controller limits exceeded (current, number of LEDs); empty if it fits. */
  controllerWarnings: string[];
}

export interface BomSupply {
  /** Order code, for example "GST60A12-P1J". */
  model: string;
  /** Catalogue family, anchor of the parts page. */
  family: string;
  watts: number;
  /** Nominal current of the model at the strip voltage. */
  amps: number;
}

export interface BomBox {
  id: string;
  model: string;
  brand: string;
  innerMm: [number, number, number];
  fits: boolean;
  auto: boolean;
  /** What goes inside. */
  contents: string[];
}

export interface BomCorner {
  x: number;
  y: number;
  segments: [number, number];
  wireMm: 0;
}

/** Free end of a segment, where a slot would be. */
export interface CornerEnd {
  segmentId: number;
  role: 'DIN' | 'DOUT';
  at: Point;
  outward: Point;
}

export interface BomPiece {
  id: number;
  points: readonly Point[];
  lengthMm: number;
  closed: boolean;
  /** Dot: no slots, the lit length is the whole segment. */
  dot: boolean;
}

const round2 = (n: number): number => Math.round(n * 100) / 100;
const round4 = (n: number): number => Math.round(n * 10000) / 10000;

function unit(dx: number, dy: number): [number, number] {
  const n = Math.hypot(dx, dy);
  if (n < 1e-9) return [1, 0];
  return [round4(dx / n), round4(dy / n)];
}

const sub = (a: Point, b: Point): Point => [a[0] - b[0], a[1] - b[1]];
const dot = (a: Point, b: Point): number => a[0] * b[0] + a[1] * b[1];
const hypot = (a: Point, b: Point): number => Math.hypot(a[0] - b[0], a[1] - b[1]);

function direction(points: readonly Point[], atEnd: boolean): [number, number] {
  if (points.length < 2) return [1, 0];
  const a = atEnd ? points[points.length - 2]! : points[0]!;
  const b = atEnd ? points[points.length - 1]! : points[1]!;
  return unit(b[0] - a[0], b[1] - a[1]);
}

/**
 * Distances from the DIN of the anchor holes. Every ANCHOR_SPACING, at least
 * ANCHOR_MIN_PER_SEGMENT if they fit, ≥ 10 mm from the lip of the slot
 * (WIRE_SLOT_L more at the end; 0 if the segment is closed).
 */
export function anchorStations(
  lengthMm: number,
  params: Pick<Params, 'ANCHOR_SPACING' | 'ANCHOR_MIN_PER_SEGMENT' | 'WIRE_SLOT_L'>,
): number[] {
  const margin = HOLE_CLEARANCE_MM + Math.max(0, params.WIRE_SLOT_L);
  const usable = lengthMm - 2 * margin;
  if (!(usable >= 0)) return [];
  const maxFit = Math.floor(usable / margin) + 1;
  if (maxFit <= 0) return [];
  const step = params.ANCHOR_SPACING > 0 ? params.ANCHOR_SPACING : margin;
  const spaced: number[] = [];
  for (let t = margin; t <= lengthMm - margin + 1e-6; t += step) spaced.push(t);
  const count = Math.min(Math.max(spaced.length, params.ANCHOR_MIN_PER_SEGMENT), maxFit);
  if (count <= spaced.length) return spaced.slice(0, count);
  if (count === 1) return [lengthMm / 2];
  const out: number[] = [];
  for (let i = 0; i < count; i++) out.push(margin + (usable * i) / (count - 1));
  return out;
}

/** Crossing in front of the end: that end is not a slot, the channel continues. */
export function crossingAhead(end: Point, outward: Point, crossings: readonly Point[], gap: number): Point | null {
  let best: Point | null = null;
  let bestD = Infinity;
  for (const c of crossings) {
    const dx = c[0] - end[0];
    const dy = c[1] - end[1];
    const d = Math.hypot(dx, dy);
    if (d > gap + 0.8 || d < 0.2) continue;
    if ((dx * outward[0] + dy * outward[1]) / d < 0.7) continue;
    if (d < bestD) {
      best = c;
      bestD = d;
    }
  }
  return best;
}

function clamp01(t: number): number {
  return Math.max(0, Math.min(1, t));
}

/** Minimum distance between two segments. */
function segmentDistance(p0: Point, p1: Point, q0: Point, q1: Point): number {
  const d1 = sub(p1, p0);
  const d2 = sub(q1, q0);
  const r = sub(p0, q0);
  const a = dot(d1, d1);
  const e = dot(d2, d2);
  const f = dot(d2, r);
  const eps = 1e-12;
  let s: number;
  let t: number;
  if (a <= eps && e <= eps) return hypot(p0, q0);
  if (a <= eps) {
    s = 0;
    t = clamp01(f / e);
  } else {
    const c = dot(d1, r);
    if (e <= eps) {
      t = 0;
      s = clamp01(-c / a);
    } else {
      const b = dot(d1, d2);
      const denom = a * e - b * b;
      s = denom > eps ? clamp01((b * f - c * e) / denom) : 0;
      t = (b * s + f) / e;
      if (t < 0) {
        t = 0;
        s = clamp01(-c / a);
      } else if (t > 1) {
        t = 1;
        s = clamp01((b - c) / a);
      }
    }
  }
  const cx = p0[0] + d1[0] * s - (q0[0] + d2[0] * t);
  const cy = p0[1] + d1[1] * s - (q0[1] + d2[1] * t);
  return Math.hypot(cx, cy);
}

function slotAxesNear(a: CornerEnd, b: CornerEnd, back: number, fwd: number, width: number): boolean {
  const a0: Point = [a.at[0] - a.outward[0] * back, a.at[1] - a.outward[1] * back];
  const a1: Point = [a.at[0] + a.outward[0] * fwd, a.at[1] + a.outward[1] * fwd];
  const b0: Point = [b.at[0] - b.outward[0] * back, b.at[1] - b.outward[1] * back];
  const b1: Point = [b.at[0] + b.outward[0] * fwd, b.at[1] + b.outward[1] * fwd];
  return segmentDistance(a0, a1, b0, b1) < width - 1e-6;
}

export interface CornerJoint extends BomCorner {
  ends: [CornerEnd, CornerEnd];
}

/**
 * DOUT+DIN pairs whose slots overlap, or whose lips are less than
 * CORNER_MERGE_DIST apart. Every end enters a single pocket.
 */
export function cornerJoints(
  ends: readonly CornerEnd[],
  crossings: readonly Point[],
  params: Pick<Params, 'CORNER_MERGE_DIST' | 'WIRE_SLOT_L' | 'CHANNEL_W' | 'CROSSING_GAP'>,
): CornerJoint[] {
  const free = ends.filter((end) => crossingAhead(end.at, end.outward, crossings, params.CROSSING_GAP) === null);
  const back = params.WIRE_SLOT_L;
  const fwd = params.CHANNEL_W / 2;
  const candidates: { dist: number; a: CornerEnd; b: CornerEnd }[] = [];
  for (const a of free) {
    if (a.role !== 'DOUT') continue;
    for (const b of free) {
      if (b.role !== 'DIN' || a.segmentId === b.segmentId) continue;
      const dist = hypot(a.at, b.at);
      const close = dist <= params.CORNER_MERGE_DIST + 1e-6;
      if (!close && !slotAxesNear(a, b, back, fwd, params.CHANNEL_W)) continue;
      candidates.push({ dist, a, b });
    }
  }
  candidates.sort(
    (p, q) => p.dist - q.dist || Math.min(p.a.segmentId, p.b.segmentId) - Math.min(q.a.segmentId, q.b.segmentId),
  );
  const used = new Set<string>();
  const key = (end: CornerEnd): string => `${end.segmentId}:${end.role}`;
  const joints: CornerJoint[] = [];
  for (const candidate of candidates) {
    const ka = key(candidate.a);
    const kb = key(candidate.b);
    if (used.has(ka) || used.has(kb)) continue;
    used.add(ka);
    used.add(kb);
    const segments: [number, number] =
      candidate.a.segmentId < candidate.b.segmentId
        ? [candidate.a.segmentId, candidate.b.segmentId]
        : [candidate.b.segmentId, candidate.a.segmentId];
    joints.push({
      x: round2((candidate.a.at[0] + candidate.b.at[0]) / 2),
      y: round2((candidate.a.at[1] + candidate.b.at[1]) / 2),
      segments,
      wireMm: 0,
      ends: [candidate.a, candidate.b],
    });
  }
  joints.sort((a, b) => a.y - b.y || a.x - b.x || a.segments[0] - b.segments[0]);
  return joints;
}

function openEnds(pieces: readonly BomPiece[]): CornerEnd[] {
  const ends: CornerEnd[] = [];
  for (const piece of pieces) {
    if (piece.closed || piece.dot || piece.points.length < 2) continue;
    const start = piece.points[0]!;
    const next = piece.points[1]!;
    const prev = piece.points[piece.points.length - 2]!;
    const end = piece.points[piece.points.length - 1]!;
    const din = unit(next[0] - start[0], next[1] - start[1]);
    const dout = unit(end[0] - prev[0], end[1] - prev[1]);
    ends.push({
      segmentId: piece.id,
      role: 'DIN',
      at: [start[0], start[1]],
      outward: [-din[0], -din[1]],
    });
    ends.push({ segmentId: piece.id, role: 'DOUT', at: [end[0], end[1]], outward: dout });
  }
  return ends;
}

/** How many anchor holes fit on the path. */
export function anchorHoleCount(
  lengthMm: number,
  params: Pick<Params, 'ANCHOR_SPACING' | 'ANCHOR_MIN_PER_SEGMENT' | 'WIRE_SLOT_L'>,
  closed = false,
): number {
  const used = closed ? { ...params, WIRE_SLOT_L: 0 } : params;
  return anchorStations(lengthMm, used).length;
}

export function buildBom(
  pieces: readonly BomPiece[],
  params: Pick<
    Params,
    | 'CUT_PITCH'
    | 'LED_PER_M'
    | 'ANCHOR_SPACING'
    | 'ANCHOR_MIN_PER_SEGMENT'
    | 'WIRE_SLOT_W'
    | 'WIRE_SLOT_L'
    | 'CORNER_MERGE_DIST'
    | 'CHANNEL_W'
    | 'CROSSING_GAP'
    | 'LED_MAX_MA'
    | 'STRIP_V'
  > &
    Partial<Pick<Params, 'CONTROLLER_ID' | 'BOX_ID'>>,
  warnings: readonly string[],
  crossings: readonly Point[] = [],
): Bom {
  const segments: BomSegment[] = pieces.map((piece) => {
    const points = piece.points;
    const pitch = params.CUT_PITCH > 0 ? params.CUT_PITCH : 1;
    const slot = piece.closed || piece.dot ? 0 : Math.min(Math.max(params.WIRE_SLOT_L, 0), piece.lengthMm / 2);
    const litMm = Math.max(0, piece.lengthMm - 2 * slot);
    const din = pointAtDistance(points, slot);
    const dout = pointAtDistance(points, Math.max(0, piece.lengthMm - slot));
    return {
      id: piece.id,
      lengthMm: round2(piece.lengthMm),
      ledCount: piece.dot ? DOT_LED_COUNT : Math.max(0, Math.round((litMm * params.LED_PER_M) / 1000)),
      cutLengthMm: Math.floor((litMm + 1e-6) / pitch) * pitch,
      din: [round2(din.at[0]), round2(din.at[1])],
      dout: [round2(dout.at[0]), round2(dout.at[1])],
      dinDir: din.dir,
      doutDir: dout.dir,
    };
  });
  const corners = cornerJoints(openEnds(pieces), crossings, params).map(({ x, y, segments: ids, wireMm }) => ({
    x,
    y,
    segments: ids,
    wireMm,
  }));
  const totalLeds = segments.reduce((sum, s) => sum + s.ledCount, 0);
  return {
    segments,
    totalLeds,
    anchorHoles: pieces.reduce((sum, s) => sum + (s.dot ? 0 : anchorHoleCount(s.lengthMm, params, s.closed)), 0),
    wireSlots: Math.max(0, pieces.filter((piece) => !piece.closed && !piece.dot).length * 2 - corners.length * 2),
    wireSlotW: params.WIRE_SLOT_W,
    wireSlotL: params.WIRE_SLOT_L,
    corners,
    assembly: bomAssembly(segments, corners, totalLeds, params.LED_MAX_MA, params.STRIP_V, params.CONTROLLER_ID, params.BOX_ID),
    warnings: [...warnings],
  };
}

const LEAD_MM = 200;

/**
 * Box from the footprints: the power supply if it is panel-mount (the plug-in adapter stays outside) and
 * the controller (indicative size if the maker does not publish it).
 */
function boxOf(
  supply: BomSupply | null,
  controller: ReturnType<typeof controllerOf> | null,
  boxId: string,
): { box: BomBox | null; boxWarnings: string[]; boxesThatFit: string[] } {
  const items: BoxItem[] = [];
  const family = supply ? SUPPLIES.find((f) => f.id === supply.family) : undefined;
  if (supply && family && family.kind === 'enclosed') items.push({ label: supply.model, sizeMm: family.sizeMm });
  if (controller) items.push({ label: controller.model, sizeMm: controller.sizeMm ?? CONTROLLER_FALLBACK_MM });
  const pick = pickBox(items, boxId);
  const fitting = boxesThatFit(items);
  const contents = items.map((i) => i.label);
  if (!pick.box) {
    const warnings = pick.auto && items.length > 0
      ? [`No box in the catalogue holds ${contents.join(' + ')}.`]
      : [];
    return { box: null, boxWarnings: warnings, boxesThatFit: fitting };
  }
  const box: BomBox = {
    id: pick.box.id,
    model: pick.box.model,
    brand: pick.box.brand,
    innerMm: pick.box.innerMm,
    fits: pick.fits,
    auto: pick.auto,
    contents,
  };
  const warnings = pick.fits ? [] : [`Box ${pick.box.model} too small for ${contents.join(' + ')}.`];
  return { box, boxWarnings: warnings, boxesThatFit: fitting };
}

function supplyOf(volts: number, amps: number): BomSupply | null {
  const pick = pickSupply(volts, amps);
  if (!pick) return null;
  return { model: pick.variant.model, family: pick.family.id, watts: pick.family.watts, amps: pick.variant.amps };
}

/**
 * Summary: 3-wire solder joints, corner joints, wire as the crow flies, current and power supply.
 * `ledMaxMa` is the current of one LED at 5 V: for the same power per LED, at `voltageV` it scales
 * as 5 / voltageV. The power supply has a 25 % margin. Beyond the limits of the chosen
 * controller (`controllerId`, from `CONTROLLERS`) warnings stay: power injection or a second controller is needed.
 */
export function bomAssembly(
  segments: readonly BomSegment[],
  corners: readonly BomCorner[],
  totalLeds: number,
  ledMaxMa: number,
  voltageV = 5,
  controllerId?: string,
  boxId: string = BOX_AUTO,
): BomAssembly {
  const used = new Set<string>();
  for (const corner of corners) {
    for (const id of corner.segments) {
      const seg = segments.find((item) => item.id === id);
      if (!seg) continue;
      const dinD = Math.hypot(seg.din[0] - corner.x, seg.din[1] - corner.y);
      const doutD = Math.hypot(seg.dout[0] - corner.x, seg.dout[1] - corner.y);
      used.add(dinD <= doutD ? `${id}:DIN` : `${id}:DOUT`);
    }
  }
  const dins: { id: number; at: [number, number] }[] = [];
  const douts: { id: number; at: [number, number] }[] = [];
  for (const seg of segments) {
    if (!used.has(`${seg.id}:DIN`)) dins.push({ id: seg.id, at: seg.din });
    if (!used.has(`${seg.id}:DOUT`)) douts.push({ id: seg.id, at: seg.dout });
  }
  const pairs: { d: number; i: number; j: number }[] = [];
  dins.forEach((din, i) => {
    douts.forEach((dout, j) => {
      if (din.id === dout.id) return;
      pairs.push({ d: Math.hypot(din.at[0] - dout.at[0], din.at[1] - dout.at[1]), i, j });
    });
  });
  pairs.sort((a, b) => a.d - b.d || a.i - b.i || a.j - b.j);
  const usedIn = new Set<number>();
  const usedOut = new Set<number>();
  let wireMm = 0;
  let matched = 0;
  for (const pair of pairs) {
    if (usedIn.has(pair.i) || usedOut.has(pair.j)) continue;
    usedIn.add(pair.i);
    usedOut.add(pair.j);
    wireMm += pair.d;
    matched += 1;
  }
  const unmatched = dins.length + douts.length - 2 * matched;
  wireMm += unmatched * LEAD_MM;
  const solderJoints = matched + unmatched;
  const volts = STRIP_VOLTAGES.includes(voltageV) ? voltageV : 5;
  const maxCurrentA = ((totalLeds * Math.max(ledMaxMa, 0)) / 1000) * (5 / volts);
  const supplyA = totalLeds === 0 ? 0 : Math.max(1, Math.ceil(maxCurrentA * 1.25));
  const controllerWarnings: string[] = [];
  const spec = controllerOf(controllerId);
  const controller = `${spec.name} (${spec.model})`;
  if (volts < spec.minV || volts > spec.maxV) {
    controllerWarnings.push(`${volts} V strip: the ${controller} controller takes ${spec.minV}–${spec.maxV} V. Another controller is needed.`);
  }
  const maxA = controllerAmps(spec, volts);
  if (supplyA > maxA) {
    controllerWarnings.push(
      `${supplyA} A power supply at ${volts} V: over the ${maxA} A of the ${controller} controller. ` +
        'Power must be injected along the strip, or a second controller added.',
    );
  }
  if (totalLeds > spec.maxIcs) {
    controllerWarnings.push(
      `${totalLeds} LEDs: over the limit of ${spec.maxIcs} ICs of the ${controller} controller. A second controller is needed.`,
    );
  }
  const supply = supplyOf(volts, supplyA);
  const { box, boxWarnings, boxesThatFit: fitting } = boxOf(supply, totalLeds === 0 ? null : spec, boxId);
  return {
    bendCuts: 0,
    jumpers: 0,
    assemblyMin: 0,
    segments: segments.length,
    solderJoints,
    wires: solderJoints * 3,
    corners: corners.length,
    wireM: Math.round(wireMm / 10) / 100,
    totalLeds,
    voltageV: volts,
    maxCurrentA: Math.round(maxCurrentA * 100) / 100,
    supplyA,
    supply,
    box,
    boxWarnings,
    boxesThatFit: fitting,
    controller: spec.id,
    controllerWarnings,
  };
}

/** Adapts a chain to the bill of materials. The length is that of the smoothed line, if there is one. */
export function bomPiece(chain: ChainPath & { id: number; smooth?: readonly Point[]; dot?: boolean }): BomPiece {
  const points =
    chain.smooth && chain.smooth.length >= 2
      ? chain.smooth.map((p): Point => [p[0], p[1]])
      : chain.points;
  let lengthMm = 0;
  for (let i = 1; i < points.length; i++) lengthMm += hypot(points[i - 1]!, points[i]!);
  return { id: chain.id, points, lengthMm, closed: chain.closed, dot: chain.dot === true };
}

function pointAtDistance(points: readonly Point[], distance: number): { at: Point; dir: [number, number] } {
  if (points.length === 0) return { at: [0, 0], dir: [1, 0] };
  if (points.length === 1) return { at: points[0]!, dir: direction(points, false) };
  let left = Math.max(0, distance);
  for (let i = 1; i < points.length; i++) {
    const a = points[i - 1]!;
    const b = points[i]!;
    const len = hypot(a, b);
    const dir = unit(b[0] - a[0], b[1] - a[1]);
    if (left <= len + 1e-9 || i === points.length - 1) {
      const t = len < 1e-9 ? 0 : Math.min(1, left / len);
      return { at: [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t], dir };
    }
    left -= len;
  }
  return { at: points[points.length - 1]!, dir: direction(points, true) };
}
