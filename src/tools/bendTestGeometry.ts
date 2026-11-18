// Geometry of the test parts for R_MIN / HINGE_MAX_DEG (SPEC §2).
// Part A (arcs): an S of alternating 180° arcs, channel widened by the sagitta s = P²/(8R).
// Part B (corners): zig-zag of straights 3·HINGE_PITCH long with sharp corners.
// Part D (tilt): four R10 arcs, 40 mm straights, floor rotated about the tangent.
// Part E (joints): corners 90°, 90°, 120° with a CORNER_POCKET. In the sample only.
// Markers without text: through holes in the floor before every bend, notches on the outer edge.
// As in the sign: DIN/DOUT wire slots over the whole end of the channel (holes.ts).
import type { Box, CrossSection, ErrorStatus, Manifold, ManifoldToplevel, Vec2, Vec3 } from 'manifold-3d';
import { COB_5MM, resolveParams, type Params, totalHeight } from '../config';

/**
 * The test parts are designed for the COB strip with notches, the only one that follows curves.
 * They do not follow the configurator's default strip, which does not bend sideways.
 */
const DEFAULT_PARAMS = resolveParams({ STRIP_ID: COB_5MM.id });
import { planChamfer, profiledBody, type ChamferPlan } from '../geometry/edgeProfile';
import { lipChamferSolid, wireSlotCuts, wireSlotSection, type SlotEnd } from '../geometry/holes';
import { getManifold } from '../geometry/manifold';

export type BendTestKind = 'arcs' | 'corners' | 'bank' | 'joints';

export const BEND_RADII: readonly number[] = [40, 25, 15, 10, 7];
export const BEND_ANGLES_DEG: readonly number[] = [30, 45, 60, 75, 90];
export const BANK_DEGS: readonly number[] = [0, 20, 35, 50];
export const BANK_RADIUS = 10;
export const BANK_STRAIGHT = 40;
const BANK_SWEEP_DEG = 90;
export const JOINT_ANGLES_DEG: readonly number[] = [90, 90, 120];
export const JOINT_STRAIGHT = 40;
/** Channel tolerance variants: the one in use and one wider by this step, mm. */
export const VARIANT_STEP = 0.4;

/** The two widths of the variants: the channel of the parameters and +VARIANT_STEP. */
export function variantWidths(channelW: number): number[] {
  return [channelW, Math.round((channelW + VARIANT_STEP) * 100) / 100];
}

const ARC_STRAIGHT = 30;
const ARC_SWEEP_DEG = 180;
/** Part B: direction of the first stretch, chosen so that the zig-zag advances along +X. */
const CORNER_START_DEG = -15;
/** Maximum chord-to-arc deviation of the central polyline. */
const ARC_TOLERANCE = 0.005;

const MARK_HOLE_D = 2;
/** Distance from the start of the bend to the centre of the first hole, along the preceding straight. */
const MARK_HOLE_FIRST = 2.5;
const MARK_HOLE_PITCH = 4;
const MARK_HOLE_SEGMENTS = 24;

const NOTCH_W = 1.6;
const NOTCH_DEPTH = 1.0;
const NOTCH_FIRST = 6;
const NOTCH_PITCH = 3.5;

/** Half-width of the thin ribbon around the centreline, then inflated with an offset. */
const RIBBON_HALF = 0.05;
const ROUND_SEGMENTS = 96;

const PACK_GAP = 4;
const PACK_STEP = 0.5;

export type BendTestParams = Pick<
  Params,
  | 'CHANNEL_W'
  | 'CHANNEL_DEPTH'
  | 'WALL'
  | 'FLOOR'
  | 'STRIP_W'
  | 'STRIP_T'
  | 'BANK_TRANSITION_L'
  | 'HINGE_PITCH'
  | 'WIRE_SLOT_W'
  | 'WIRE_SLOT_L'
  | 'SLOT_LIP_CHAMFER'
  | 'EDGE_PROFILE'
  | 'CHAMFER_SIZE'
  | 'CHAMFER_ANGLE'
  | 'LAYER_STEP'
>;

export interface BendTestOptions {
  kind: BendTestKind;
  params?: Partial<BendTestParams>;
  /** true: one part for every width of `variantWidths(CHANNEL_W)`, marked with 1/2 notches. */
  variants?: boolean;
}

export interface BendTestPiece {
  channelW: number;
  notches: number;
  offsetY: number;
  /** Through holes: expectedHoles must hold (markers 1 + 2 + … plus 2 wire slots). */
  genus: number;
}

export interface BendTestResult {
  kind: BendTestKind;
  /** To be freed with `delete()` by the caller. */
  manifold: Manifold;
  status: ErrorStatus;
  bounds: Box;
  pieces: BendTestPiece[];
  pathLength: number;
  /** Markers + wire slots. */
  expectedHoles: number;
  /** Effective chamfer (after validation) and its warnings. */
  chamfer: ChamferPlan;
}

export interface Bend {
  /** Radius (arcs) or angle in degrees (corners): what the marker identifies. */
  label: number;
  /** Point where the bend starts (start of the arc or vertex of the corner). */
  start: Vec2;
  /** Incoming direction. */
  heading: Vec2;
  /** Outgoing direction. */
  headingOut: Vec2;
  /** +1 = left (counter-clockwise), −1 = right. */
  turn: 1 | -1;
  /** Arcs only. */
  arc?: { center: Vec2; radius: number; points: Vec2[] };
}

/** Path of the strip: `start` is the DIN, `end` the DOUT (SPEC §5 "Direction of the segments"). */
export interface CenterPath {
  points: Vec2[];
  bends: Bend[];
  start: Vec2;
  startHeading: Vec2;
  end: Vec2;
  endHeading: Vec2;
  length: number;
  /** Part D: arcs with tilt, by arc length. */
  bankSpans?: readonly BankSpan[];
  /** Part E: a through pocket on every corner. */
  cornerPockets?: boolean;
}

export interface BankSpan {
  s0: number;
  s1: number;
  deg: number;
  turn: 1 | -1;
  headingIn: Vec2;
  headingOut: Vec2;
}

export interface WireSlot {
  role: 'DIN' | 'DOUT';
  /** End of the segment: inner lip of the slot when EXTRA = L. */
  center: Vec2;
  /** Tangent of the path in the DIN → DOUT direction. */
  tangent: Vec2;
  /** Out of the segment, towards the end wall. */
  outward: Vec2;
}

const add = (a: Vec2, b: Vec2): Vec2 => [a[0] + b[0], a[1] + b[1]];
const sub = (a: Vec2, b: Vec2): Vec2 => [a[0] - b[0], a[1] - b[1]];
const scale = (a: Vec2, k: number): Vec2 => [a[0] * k, a[1] * k];
const dot = (a: Vec2, b: Vec2): number => a[0] * b[0] + a[1] * b[1];
const unit = (a: Vec2): Vec2 => scale(a, 1 / Math.hypot(a[0], a[1]));
const leftNormal = (t: Vec2): Vec2 => [-t[1], t[0]];
const dirOf = (rad: number): Vec2 => [Math.cos(rad), Math.sin(rad)];

/** Sagitta of a chord `pitch` long on an arc of radius R (SPEC §5 [F]). */
export const sagitta = (pitch: number, radius: number): number => (pitch * pitch) / (8 * radius);

/**
 * Part B: maximum distance from the vertex of the centreline reached by a strip `stripW`
 * wide bent by `angleDeg` at a single notch. Worst case: pivot on the outer edge,
 * the corner of the stiff stretch sticks out by (w/2)/cos(θ/2).
 */
export const cornerOuterRadius = (stripW: number, channelW: number, angleDeg: number): number =>
  Math.max(
    channelW / 2,
    stripW / 2 / Math.cos((angleDeg * Math.PI) / 360) + (channelW - stripW) / 2,
  );

export function bendTestPath(kind: BendTestKind, hingePitch = DEFAULT_PARAMS.HINGE_PITCH): CenterPath {
  switch (kind) {
    case 'arcs':
      return arcsPath(BEND_RADII);
    case 'corners':
      return cornersPath(BEND_ANGLES_DEG, 3 * hingePitch);
    case 'bank':
      return bankPath();
    case 'joints':
      return { ...cornersPath(JOINT_ANGLES_DEG, JOINT_STRAIGHT), cornerPockets: true };
  }
}

/**
 * Horizontal footprint of a STRIP_W × STRIP_T strip rotated by `bankDeg`
 * about the tangent, plus the tolerance already in CHANNEL_W.
 */
export function bankedChannelHalf(stripW: number, stripT: number, channelW: number, bankDeg: number): number {
  const th = (Math.abs(bankDeg) * Math.PI) / 180;
  const footprint = stripW * Math.abs(Math.cos(th)) + stripT * Math.abs(Math.sin(th));
  const clearance = Math.max(0, channelW - stripW);
  return Math.max(channelW, footprint + clearance) / 2;
}

/** Straight, then for every radius a 180° arc + straight. Starts at (0,0) towards +Y, first arc to the right. */
function arcsPath(radii: readonly number[]): CenterPath {
  const sweep = (ARC_SWEEP_DEG * Math.PI) / 180;
  let pos: Vec2 = [0, 0];
  let heading = Math.PI / 2;
  const points: Vec2[] = [pos];
  const bends: Bend[] = [];
  let length = 0;

  const straight = (len: number): void => {
    pos = add(pos, scale(dirOf(heading), len));
    points.push(pos);
    length += len;
  };

  straight(ARC_STRAIGHT);
  radii.forEach((radius, i) => {
    const turn: 1 | -1 = i % 2 === 0 ? -1 : 1;
    const startPos = pos;
    const startHeading = dirOf(heading);
    const center = add(pos, scale(leftNormal(startHeading), turn * radius));
    const phi0 = Math.atan2(pos[1] - center[1], pos[0] - center[0]);
    const maxStep = 2 * Math.acos(1 - ARC_TOLERANCE / radius);
    const n = Math.ceil(sweep / maxStep);
    const arcPoints: Vec2[] = [startPos];
    for (let k = 1; k <= n; k++) {
      const phi = phi0 + (turn * sweep * k) / n;
      const pt: Vec2 = [center[0] + radius * Math.cos(phi), center[1] + radius * Math.sin(phi)];
      points.push(pt);
      arcPoints.push(pt);
    }
    pos = arcPoints[arcPoints.length - 1]!;
    heading += turn * sweep;
    length += radius * sweep;
    bends.push({
      label: radius,
      start: startPos,
      heading: startHeading,
      headingOut: dirOf(heading),
      turn,
      arc: { center, radius, points: arcPoints },
    });
    straight(ARC_STRAIGHT);
  });

  return {
    points,
    bends,
    start: [0, 0],
    startHeading: dirOf(Math.PI / 2),
    end: pos,
    endHeading: dirOf(heading),
    length,
  };
}

/** Zig-zag: straight, then for every angle a corner + straight; left/right alternating. */
function cornersPath(anglesDeg: readonly number[], segment: number): CenterPath {
  let heading = (CORNER_START_DEG * Math.PI) / 180;
  let pos: Vec2 = add([0, 0], scale(dirOf(heading), segment));
  const points: Vec2[] = [[0, 0], pos];
  const bends: Bend[] = anglesDeg.map((deg, i) => {
    const turn: 1 | -1 = i % 2 === 0 ? 1 : -1;
    const start = pos;
    const headingIn = dirOf(heading);
    heading += (turn * deg * Math.PI) / 180;
    pos = add(pos, scale(dirOf(heading), segment));
    points.push(pos);
    return { label: deg, start, heading: headingIn, headingOut: dirOf(heading), turn };
  });
  return {
    points,
    bends,
    start: [0, 0],
    startHeading: dirOf((CORNER_START_DEG * Math.PI) / 180),
    end: pos,
    endHeading: dirOf(heading),
    length: segment * (anglesDeg.length + 1),
  };
}

/** Four R10 90° arcs, alternating, separated by 40 mm straights. Starts towards +X, first arc to the right. */
function bankPath(): CenterPath {
  const radius = BANK_RADIUS;
  const sweep = (BANK_SWEEP_DEG * Math.PI) / 180;
  let pos: Vec2 = [0, 0];
  let heading = 0;
  const points: Vec2[] = [pos];
  const bends: Bend[] = [];
  const bankSpans: BankSpan[] = [];
  let length = 0;

  const straight = (len: number): void => {
    pos = add(pos, scale(dirOf(heading), len));
    points.push(pos);
    length += len;
  };

  straight(BANK_STRAIGHT);
  BANK_DEGS.forEach((deg, i) => {
    const turn: 1 | -1 = i % 2 === 0 ? -1 : 1;
    const startPos = pos;
    const startHeading = dirOf(heading);
    const s0 = length;
    const center = add(pos, scale(leftNormal(startHeading), turn * radius));
    const phi0 = Math.atan2(pos[1] - center[1], pos[0] - center[0]);
    const maxStep = 2 * Math.acos(1 - ARC_TOLERANCE / radius);
    const n = Math.ceil(sweep / maxStep);
    const arcPoints: Vec2[] = [startPos];
    for (let k = 1; k <= n; k++) {
      const phi = phi0 + (turn * sweep * k) / n;
      const pt: Vec2 = [center[0] + radius * Math.cos(phi), center[1] + radius * Math.sin(phi)];
      points.push(pt);
      arcPoints.push(pt);
    }
    pos = arcPoints[arcPoints.length - 1]!;
    heading += turn * sweep;
    length += radius * sweep;
    const headingOut = dirOf(heading);
    bends.push({
      label: deg,
      start: startPos,
      heading: startHeading,
      headingOut,
      turn,
      arc: { center, radius, points: arcPoints },
    });
    bankSpans.push({ s0, s1: length, deg, turn, headingIn: startHeading, headingOut });
    straight(BANK_STRAIGHT);
  });

  return {
    points,
    bends,
    start: [0, 0],
    startHeading: dirOf(0),
    end: pos,
    endHeading: dirOf(heading),
    length,
    bankSpans,
  };
}

/**
 * Closed ribbon of half-width `half` around an open polyline, with mitred normals
 * so that the later inflation leaves the inner corners sharp in the right position.
 */
function ribbon(points: readonly Vec2[], half: number): Vec2[] {
  const right: Vec2[] = [];
  const left: Vec2[] = [];
  points.forEach((p, i) => {
    const prev = points[i - 1];
    const next = points[i + 1];
    const tIn = prev ? unit(sub(p, prev)) : undefined;
    const tOut = next ? unit(sub(next, p)) : undefined;
    const n1 = leftNormal(tIn ?? tOut!);
    const n2 = leftNormal(tOut ?? tIn!);
    const mid = unit(add(n1, n2));
    const n = scale(mid, half / dot(mid, n1));
    right.push(sub(p, n));
    left.push(add(p, n));
  });
  return [...right, ...left.reverse()];
}

/** Oriented rectangle: `along` along t (centred on c), from `n0` to `n1` along the normal n. */
function orientedRect(c: Vec2, t: Vec2, n: Vec2, along: number, n0: number, n1: number): Vec2[] {
  const h = along / 2;
  return [
    add(add(c, scale(t, -h)), scale(n, n0)),
    add(add(c, scale(t, h)), scale(n, n0)),
    add(add(c, scale(t, h)), scale(n, n1)),
    add(add(c, scale(t, -h)), scale(n, n1)),
  ];
}

/** Markers + slots. Part E adds a pocket per corner. */
export function expectedHoleCount(path: CenterPath): number {
  return markHoleCenters(path).length + wireSlots(path).length + (path.cornerPockets ? path.bends.length : 0);
}

export function markHoleCenters(path: CenterPath): Vec2[] {
  // On the corner pocket the first standard hole (2.5 mm) falls into the void: it starts further back.
  const first = path.cornerPockets ? 9 : MARK_HOLE_FIRST;
  return path.bends.flatMap((bend, i) =>
    Array.from({ length: i + 1 }, (_, j) =>
      add(bend.start, scale(bend.heading, -(first + j * MARK_HOLE_PITCH))),
    ),
  );
}

/** Wire slots: the lip is the end of the segment, the opening faces the end wall. */
export function wireSlots(path: CenterPath): WireSlot[] {
  return [
    { role: 'DIN', center: path.start, tangent: path.startHeading, outward: scale(path.startHeading, -1) },
    { role: 'DOUT', center: path.end, tangent: path.endHeading, outward: path.endHeading },
  ];
}

function slotEnd(slot: WireSlot): SlotEnd {
  return { at: slot.center, outward: slot.outward };
}

/** Notches on the outer side of the first straight (opposite the first bend). */
function notchPolygons(path: CenterPath, count: number, outerHalf: number): Vec2[][] {
  const firstTurn = path.bends[0]?.turn ?? -1;
  const n = scale(leftNormal(path.startHeading), -firstTurn);
  return Array.from({ length: count }, (_, j) => {
    const c = add(path.start, scale(path.startHeading, NOTCH_FIRST + j * NOTCH_PITCH));
    return orientedRect(c, path.startHeading, n, NOTCH_W, outerHalf - NOTCH_DEPTH, outerHalf + 1);
  });
}

/**
 * Plan footprint of the channel (void): rounded end at the extremity,
 * widened on the inner side of arcs and corners.
 */
export function channelSection(
  wasm: ManifoldToplevel,
  path: CenterPath,
  p: Pick<BendTestParams, 'CHANNEL_W' | 'STRIP_W' | 'STRIP_T' | 'HINGE_PITCH' | 'BANK_TRANSITION_L'>,
): CrossSection {
  const { CrossSection } = wasm;
  const halfW = p.CHANNEL_W / 2;
  const temps: CrossSection[] = [];
  const tmp = (x: CrossSection): CrossSection => (temps.push(x), x);
  const fills: CrossSection[] = [];
  try {
    const centerline = path.points;
    const centre = tmp(new CrossSection(ribbon(centerline, RIBBON_HALF), 'NonZero'));
    fills.push(tmp(centre.offset(halfW - RIBBON_HALF, 'Round', 2, ROUND_SEGMENTS)));

    for (const bend of path.bends) {
      if (bend.arc) {
        // The chords of the chain fall towards the centre: only the inner side is widened by s.
        const { center, radius, points } = bend.arc;
        const s = sagitta(p.HINGE_PITCH, radius);
        const k = (radius - s / 2) / radius;
        const shifted = points.map((pt) => add(center, scale(sub(pt, center), k)));
        const band = tmp(new CrossSection(ribbon(shifted, RIBBON_HALF), 'NonZero'));
        fills.push(tmp(band.offset(halfW + s / 2 - RIBBON_HALF, 'Round', 2, ROUND_SEGMENTS)));
      } else {
        // Corner: sharp inside (given by the offset), outside rounded with the needed radius.
        const angle = Math.acos(Math.max(-1, Math.min(1, dot(bend.heading, bend.headingOut))));
        const rOut = cornerOuterRadius(p.STRIP_W, p.CHANNEL_W, (angle * 180) / Math.PI);
        const far = (2 * rOut) / Math.sin(angle / 2);
        const innerWedge = tmp(
          new CrossSection(
            [bend.start, add(bend.start, scale(bend.heading, -far)), add(bend.start, scale(bend.headingOut, far))],
            'NonZero',
          ),
        );
        const disc = tmp(tmp(CrossSection.circle(rOut, ROUND_SEGMENTS)).translate(bend.start));
        fills.push(tmp(disc.subtract(innerWedge)));
      }
    }
    if (path.bankSpans && path.bankSpans.length > 0) {
      for (const band of bankRibbons(path, p)) {
        const section = tmp(new CrossSection([band.points], 'NonZero'));
        fills.push(tmp(section.offset(band.half - RIBBON_HALF, 'Round', 2, ROUND_SEGMENTS)));
      }
    }
    return CrossSection.union(fills);
  } finally {
    for (const t of temps) t.delete();
  }
}

interface Piece {
  solid: Manifold;
  outline: CrossSection;
}

function rampRadians(s: number, span: BankSpan, transition: number): number {
  const full = (span.deg * Math.PI) / 180;
  if (!(full > 0)) return 0;
  if (s >= span.s0 && s <= span.s1) return full;
  if (transition > 0 && s >= span.s0 - transition && s < span.s0) return (full * (s - (span.s0 - transition))) / transition;
  if (transition > 0 && s > span.s1 && s <= span.s1 + transition) return full * (1 - (s - span.s1) / transition);
  return 0;
}

function spanInner(span: BankSpan, s: number, tangent: Vec2): Vec2 {
  const heading = s < span.s0 ? span.headingIn : s > span.s1 ? span.headingOut : tangent;
  return scale(leftNormal(heading), span.turn);
}

/** Half-width of the channel and tilt (inner side lower) at an abscissa. */
function bankFrame(
  path: CenterPath,
  s: number,
  tangent: Vec2,
  p: Pick<BendTestParams, 'CHANNEL_W' | 'STRIP_W' | 'STRIP_T' | 'HINGE_PITCH' | 'BANK_TRANSITION_L'>,
): { half: number; tilt: Vec2 } {
  const spans = path.bankSpans ?? [];
  let deg = 0;
  let tilt: Vec2 = [0, 0];
  for (const span of spans) {
    const rad = rampRadians(s, span, p.BANK_TRANSITION_L);
    if (!(rad > 0)) continue;
    deg = Math.max(deg, (rad * 180) / Math.PI);
    tilt = add(tilt, scale(spanInner(span, s, tangent), Math.sin(rad)));
  }
  let half = bankedChannelHalf(p.STRIP_W, p.STRIP_T, p.CHANNEL_W, deg);
  for (const span of spans) {
    if (s >= span.s0 && s <= span.s1) half += sagitta(p.HINGE_PITCH, BANK_RADIUS) / 2;
  }
  return { half, tilt };
}

interface Station {
  pos: Vec2;
  tangent: Vec2;
  lateral: Vec2;
  s: number;
  half: number;
  tilt: Vec2;
}

function stationsOf(
  path: CenterPath,
  p: Pick<BendTestParams, 'CHANNEL_W' | 'STRIP_W' | 'STRIP_T' | 'HINGE_PITCH' | 'BANK_TRANSITION_L'>,
  step: number,
): Station[] {
  const extra = p.CHANNEL_W;
  const poly = [
    add(path.start, scale(path.startHeading, -extra)),
    ...path.points,
    add(path.end, scale(path.endHeading, extra)),
  ];
  const out: Station[] = [];
  let s = -extra;
  const push = (pos: Vec2, tangent: Vec2, at: number): void => {
    const prev = out[out.length - 1];
    if (prev && Math.hypot(pos[0] - prev.pos[0], pos[1] - prev.pos[1]) < 0.05) return;
    const frame = bankFrame(path, at, tangent, p);
    out.push({ pos, tangent, lateral: leftNormal(tangent), s: at, half: frame.half, tilt: frame.tilt });
  };
  push(poly[0]!, unit(sub(poly[1]!, poly[0]!)), s);
  for (let i = 1; i < poly.length; i++) {
    const a = poly[i - 1]!;
    const b = poly[i]!;
    const seg = Math.hypot(b[0] - a[0], b[1] - a[1]);
    if (seg < 1e-6) continue;
    const tangent = scale(sub(b, a), 1 / seg);
    let walked = 0;
    while (walked + step < seg - 1e-6) {
      walked += step;
      s += step;
      push(add(a, scale(tangent, walked)), tangent, s);
    }
    s += seg - walked;
    push(b, tangent, s);
  }
  return out;
}

function bankRibbons(
  path: CenterPath,
  p: Pick<BendTestParams, 'CHANNEL_W' | 'STRIP_W' | 'STRIP_T' | 'HINGE_PITCH' | 'BANK_TRANSITION_L'>,
): { points: Vec2[]; half: number }[] {
  const frames = stationsOf(path, p, 2);
  const bands: { points: Vec2[]; half: number }[] = [];
  let cur: Vec2[] = [];
  let half = 0;
  const flush = (): void => {
    if (cur.length >= 2 && half > p.CHANNEL_W / 2 + 0.05) bands.push({ points: cur, half });
    cur = [];
  };
  for (const frame of frames) {
    if (cur.length > 0 && Math.abs(frame.half - half) > 0.15) {
      cur.push(frame.pos);
      flush();
    }
    if (cur.length === 0) half = frame.half;
    else half = Math.max(half, frame.half);
    cur.push(frame.pos);
  }
  flush();
  return bands.map((band) => ({ points: ribbon(band.points, RIBBON_HALF), half: band.half }));
}

function floorZ(frame: Station, lateral: number, floor: number): number {
  const offset = scale(frame.lateral, lateral);
  return floor - (offset[0] * frame.tilt[0] + offset[1] * frame.tilt[1]);
}

/** Solid from a sequence of 4-vertex sections. If the winding is inward, it is flipped. */
function loftSolid(wasm: ManifoldToplevel, sections: readonly (readonly Vec3[])[]): Manifold {
  const { Manifold, Mesh } = wasm;
  const verts: number[] = [];
  const ids: number[][] = [];
  for (const section of sections) {
    const row: number[] = [];
    for (const p of section) {
      row.push(verts.length / 3);
      verts.push(p[0], p[1], p[2]);
    }
    ids.push(row);
  }
  const tris: number[] = [];
  const tri = (a: number, b: number, c: number): void => {
    tris.push(a, b, c);
  };
  const s0 = ids[0]!;
  tri(s0[0]!, s0[1]!, s0[2]!);
  tri(s0[0]!, s0[2]!, s0[3]!);
  const sN = ids[ids.length - 1]!;
  tri(sN[0]!, sN[2]!, sN[1]!);
  tri(sN[0]!, sN[3]!, sN[2]!);
  for (let i = 0; i < ids.length - 1; i++) {
    const a = ids[i]!;
    const b = ids[i + 1]!;
    for (let k = 0; k < 4; k++) {
      const k2 = (k + 1) % 4;
      tri(a[k]!, b[k]!, b[k2]!);
      tri(a[k]!, b[k2]!, a[k2]!);
    }
  }
  const build = (order: number[]): Manifold =>
    new Manifold(
      new Mesh({
        numProp: 3,
        vertProperties: new Float32Array(verts),
        triVerts: new Uint32Array(order),
      }),
    );
  try {
    const solid = build(tris);
    if (solid.status() === 'NoError' && solid.volume() > 0) return solid;
    solid.delete();
  } catch {
    // The opposite winding is the other outer face.
  }
  const flipped: number[] = [];
  for (let i = 0; i < tris.length; i += 3) flipped.push(tris[i]!, tris[i + 2]!, tris[i + 1]!);
  return build(flipped);
}

/**
 * Void of the channel: the plan is that of the channel, the floor is the swept surface
 * (inner side lower). Walls and top stay vertical / horizontal.
 */
function bankedChannelVoid(wasm: ManifoldToplevel, path: CenterPath, channel: CrossSection, p: BendTestParams): Manifold {
  const { Manifold } = wasm;
  const frames = stationsOf(path, p, 1);
  const zTop = totalHeight(p) + 1;
  const margin = 0.4;
  const sections: Vec3[][] = frames.map((frame) => {
    const half = frame.half + margin;
    const right = scale(frame.lateral, -half);
    const left = scale(frame.lateral, half);
    const zRight = floorZ(frame, -half, p.FLOOR);
    const zLeft = floorZ(frame, half, p.FLOOR);
    return [
      [frame.pos[0] + right[0], frame.pos[1] + right[1], zRight],
      [frame.pos[0] + left[0], frame.pos[1] + left[1], zLeft],
      [frame.pos[0] + left[0], frame.pos[1] + left[1], zTop],
      [frame.pos[0] + right[0], frame.pos[1] + right[1], zTop],
    ];
  });
  const swept = loftSolid(wasm, sections);
  const prism = channel.extrude(totalHeight(p) + 3).translate([0, 0, -1]);
  const voidCut = Manifold.intersection([swept, prism]);
  swept.delete();
  prism.delete();
  return voidCut;
}

/** Corner pocket: union of the two slots at full width, chamfer on the two entries. */
function cornerPocketSolids(wasm: ManifoldToplevel, channel: CrossSection, path: CenterPath, p: BendTestParams): Manifold[] {
  const { CrossSection } = wasm;
  const wide = { ...p, WIRE_SLOT_W: p.CHANNEL_W };
  const cuts: Manifold[] = [];
  for (const bend of path.bends) {
    const ends: SlotEnd[] = [
      { at: bend.start, outward: bend.heading },
      { at: bend.start, outward: scale(bend.headingOut, -1) },
    ];
    const sections = ends.map((end) => wireSlotSection(wasm, channel, end, wide));
    let pocket = CrossSection.union(sections);
    for (const section of sections) section.delete();
    if (pocket.toPolygons().length > 1) {
      const disk = CrossSection.circle(p.CHANNEL_W / 2, ROUND_SEGMENTS).translate(bend.start);
      const joined = CrossSection.union([pocket, disk]);
      pocket.delete();
      disk.delete();
      pocket = joined;
    }
    const clipped = pocket.intersect(channel);
    pocket.delete();
    pocket = clipped;
    if (pocket.area() > 1e-8) {
      const extruded = pocket.extrude(p.FLOOR + 2);
      const hole = extruded.translate([0, 0, -1]);
      if (hole !== extruded) extruded.delete();
      cuts.push(hole);
    }
    pocket.delete();
    for (const end of ends) {
      const lip = lipChamferSolid(wasm, end, wide);
      if (lip) cuts.push(lip);
    }
  }
  return cuts;
}

function buildPiece(
  wasm: ManifoldToplevel,
  path: CenterPath,
  p: BendTestParams,
  notches: number,
  chamfer: ChamferPlan,
): Piece {
  const { CrossSection, Manifold } = wasm;
  const temps: { delete(): void }[] = [];
  const keep = <T extends { delete(): void }>(x: T): T => (temps.push(x), x);

  try {
    const channel = keep(channelSection(wasm, path, p));
    let outline = channel.offset(p.WALL, 'Round', 2, ROUND_SEGMENTS);
    if (notches > 0) {
      keep(outline);
      const outerHalf = p.CHANNEL_W / 2 + p.WALL;
      const cuts = keep(new CrossSection(notchPolygons(path, notches, outerHalf), 'NonZero'));
      outline = outline.subtract(cuts);
    }

    const body = keep(profiledBody(wasm, outline, channel, totalHeight(p), chamfer));
    const pocket = path.bankSpans
      ? keep(bankedChannelVoid(wasm, path, channel, p))
      : keep(channel.extrude(p.CHANNEL_DEPTH + 1).translate([0, 0, p.FLOOR]));
    const r = MARK_HOLE_D / 2;
    const holes = markHoleCenters(path).map((c) =>
      keep(Manifold.cylinder(p.FLOOR + 2, r, r, MARK_HOLE_SEGMENTS).translate([c[0], c[1], -1])),
    );
    const slots = wireSlotCuts(wasm, channel, wireSlots(path).map(slotEnd), p).map((cut) => keep(cut));
    const pockets = path.cornerPockets ? cornerPocketSolids(wasm, channel, path, p).map((cut) => keep(cut)) : [];
    const solid = Manifold.difference([body, pocket, ...holes, ...slots, ...pockets]);
    return { solid, outline };
  } finally {
    for (const t of temps) t.delete();
  }
}

/**
 * Y offset of every part: the next one goes down as far as possible into the hollows
 * of the previous one, keeping at least PACK_GAP mm of distance in plan.
 */
function packOffsets(outlines: readonly CrossSection[]): number[] {
  const first = outlines[0];
  if (!first) return [];
  const offsets = [0];
  let placed = first.offset(PACK_GAP, 'Round', 2, ROUND_SEGMENTS);
  for (let k = 1; k < outlines.length; k++) {
    const outline = outlines[k]!;
    const b = outline.bounds();
    const limit = placed.bounds().max[1] - b.min[1] + PACK_GAP;
    let dy = offsets[k - 1]!;
    for (;;) {
      dy += PACK_STEP;
      if (dy >= limit) break;
      const moved = outline.translate(0, dy);
      const hit = placed.intersect(moved);
      const overlap = hit.area();
      hit.delete();
      moved.delete();
      if (overlap < 1e-9) break;
    }
    offsets.push(dy);
    const grown = outline.translate(0, dy).offset(PACK_GAP, 'Round', 2, ROUND_SEGMENTS);
    const next = placed.add(grown);
    grown.delete();
    placed.delete();
    placed = next;
  }
  placed.delete();
  return offsets;
}

export function resolveBendTestParams(overrides: Partial<BendTestParams> = {}): BendTestParams {
  return {
    CHANNEL_W: DEFAULT_PARAMS.CHANNEL_W,
    CHANNEL_DEPTH: DEFAULT_PARAMS.CHANNEL_DEPTH,
    WALL: DEFAULT_PARAMS.WALL,
    FLOOR: DEFAULT_PARAMS.FLOOR,
    STRIP_W: DEFAULT_PARAMS.STRIP_W,
    STRIP_T: DEFAULT_PARAMS.STRIP_T,
    BANK_TRANSITION_L: DEFAULT_PARAMS.BANK_TRANSITION_L,
    HINGE_PITCH: DEFAULT_PARAMS.HINGE_PITCH,
    WIRE_SLOT_W: DEFAULT_PARAMS.WIRE_SLOT_W,
    WIRE_SLOT_L: DEFAULT_PARAMS.WIRE_SLOT_L,
    SLOT_LIP_CHAMFER: DEFAULT_PARAMS.SLOT_LIP_CHAMFER,
    EDGE_PROFILE: DEFAULT_PARAMS.EDGE_PROFILE,
    CHAMFER_SIZE: DEFAULT_PARAMS.CHAMFER_SIZE,
    CHAMFER_ANGLE: DEFAULT_PARAMS.CHAMFER_ANGLE,
    LAYER_STEP: DEFAULT_PARAMS.LAYER_STEP,
    ...overrides,
  };
}

/** With the defaults the slot is as wide as the channel, on the variants too (channel and +0.4). */
function channelParams(base: BendTestParams, channelW: number): BendTestParams {
  const followsChannel = Math.abs(base.WIRE_SLOT_W - base.CHANNEL_W) < 1e-9;
  return {
    ...base,
    CHANNEL_W: channelW,
    WIRE_SLOT_W: followsChannel ? channelW : Math.min(base.WIRE_SLOT_W, channelW),
  };
}

export async function buildBendTest(options: BendTestOptions): Promise<BendTestResult> {
  const wasm = await getManifold();
  const base = resolveBendTestParams(options.params);
  const path = bendTestPath(options.kind, base.HINGE_PITCH);
  const specs = options.variants
    ? variantWidths(base.CHANNEL_W).map((w, i) => ({ channelW: w, notches: i + 1 }))
    : [{ channelW: base.CHANNEL_W, notches: 0 }];

  // The chamfer depends on WALL and CHANNEL_DEPTH, the same for all the variants.
  const chamfer = planChamfer(base);
  const pieces = specs.map((s) => buildPiece(wasm, path, channelParams(base, s.channelW), s.notches, chamfer));
  try {
    const offsets = packOffsets(pieces.map((pc) => pc.outline));
    const placed = pieces.map((pc, i) => pc.solid.translate([0, offsets[i]!, 0]));
    const manifold = wasm.Manifold.union(placed);
    const info = specs.map((s, i) => ({
      ...s,
      offsetY: offsets[i]!,
      genus: pieces[i]!.solid.genus(),
    }));
    for (const m of placed) m.delete();
    return {
      kind: options.kind,
      manifold,
      status: manifold.status(),
      bounds: manifold.boundingBox(),
      pieces: info,
      pathLength: path.length,
      expectedHoles: expectedHoleCount(path),
      chamfer,
    };
  } finally {
    for (const pc of pieces) {
      pc.solid.delete();
      pc.outline.delete();
    }
  }
}
