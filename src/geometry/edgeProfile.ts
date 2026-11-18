// Profile of the top edge of the wall: outer chamfer, inner or both (SPEC §3).
// Stepped chamfer: slices LAYER_STEP high, each with an offset of the profile growing upwards.
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import type { EdgeProfile, Params } from '../config';

/** Minimum wall width that must be left on top with an inner chamfer. */
export const MIN_TOP_WALL = 0.8;
const ROUND_SEGMENTS = 96;
/**
 * The offsets multiply the vertices of already dense curves; removing those within 5 µm of the
 * chord makes the union of the slices ~5× faster with no measurable effect on the part.
 */
const SLICE_SIMPLIFY = 0.005;

export type EdgeProfileParams = Pick<
  Params,
  'EDGE_PROFILE' | 'CHAMFER_SIZE' | 'CHAMFER_ANGLE' | 'LAYER_STEP' | 'WALL' | 'CHANNEL_DEPTH'
>;

/** Effective chamfer, after validation. */
export interface ChamferPlan {
  profile: EdgeProfile;
  outer: boolean;
  inner: boolean;
  /** Vertical height; 0 = sharp edges. */
  height: number;
  /** Horizontal width = height / tan(CHAMFER_ANGLE). */
  run: number;
  layerStep: number;
  warnings: string[];
}

const fmt = (x: number): string => x.toFixed(2);

export function planChamfer(p: EdgeProfileParams): ChamferPlan {
  const warnings: string[] = [];
  const square = (): ChamferPlan => ({
    profile: 'square',
    outer: false,
    inner: false,
    height: 0,
    run: 0,
    layerStep: p.LAYER_STEP,
    warnings,
  });
  if (p.EDGE_PROFILE === 'square') return square();

  if (!(p.CHAMFER_ANGLE > 0 && p.CHAMFER_ANGLE < 90)) {
    warnings.push(`CHAMFER_ANGLE = ${p.CHAMFER_ANGLE}° outside (0°, 90°): chamfer ignored.`);
    return square();
  }
  if (!(p.LAYER_STEP > 0)) {
    warnings.push(`LAYER_STEP = ${p.LAYER_STEP} not valid: chamfer ignored.`);
    return square();
  }
  if (!(p.CHAMFER_SIZE > 0)) {
    warnings.push(`CHAMFER_SIZE = ${p.CHAMFER_SIZE}: chamfer ignored.`);
    return square();
  }

  let height = p.CHAMFER_SIZE;
  if (height > p.CHANNEL_DEPTH) {
    warnings.push(`CHAMFER_SIZE ${fmt(height)} > CHANNEL_DEPTH: reduced to ${fmt(p.CHANNEL_DEPTH)} mm.`);
    height = p.CHANNEL_DEPTH;
  }

  const tan = Math.tan((p.CHAMFER_ANGLE * Math.PI) / 180);
  const outer = p.EDGE_PROFILE === 'outer' || p.EDGE_PROFILE === 'both';
  const inner = p.EDGE_PROFILE === 'inner' || p.EDGE_PROFILE === 'both';

  if (inner) {
    const sides = outer ? 2 : 1;
    const maxRun = (p.WALL - MIN_TOP_WALL) / sides;
    if (maxRun <= 0) {
      warnings.push(`WALL ${fmt(p.WALL)} mm: no room left for the inner chamfer (min ${MIN_TOP_WALL} mm on top). Chamfer ignored.`);
      return square();
    }
    const top = p.WALL - (sides * height) / tan;
    if (top < MIN_TOP_WALL - 1e-9) {
      const reduced = maxRun * tan;
      warnings.push(
        `Only ${fmt(top)} mm of wall would be left on top (< ${MIN_TOP_WALL}): ` +
          `CHAMFER_SIZE reduced from ${fmt(height)} to ${fmt(reduced)} mm.`,
      );
      height = reduced;
    }
  }

  return { profile: p.EDGE_PROFILE, outer, inner, height, run: height / tan, layerStep: p.LAYER_STEP, warnings };
}

/**
 * Solid body of the wall (outer profile extruded up to `totalHeight`) with the chamfer on top.
 * With an inner chamfer the slices are already hollowed by the widened channel; the caller still subtracts
 * the channel and the holes as for the "square" profile, which returns exactly `outline.extrude()`.
 */
export function profiledBody(
  wasm: ManifoldToplevel,
  outline: CrossSection,
  channel: CrossSection,
  totalHeight: number,
  plan: ChamferPlan,
): Manifold {
  if (plan.height <= 0) return outline.extrude(totalHeight);

  const { Manifold } = wasm;
  const z0 = totalHeight - plan.height;
  const slope = plan.run / plan.height;
  const count = Math.ceil(plan.height / plan.layerStep - 1e-9);
  const temps: { delete(): void }[] = [];
  const tmp = <T extends { delete(): void }>(x: T): T => (temps.push(x), x);

  try {
    const parts: Manifold[] = [tmp(outline.extrude(z0))];
    for (let i = 0; i < count; i++) {
      const zb = z0 + i * plan.layerStep;
      const zt = Math.min(z0 + (i + 1) * plan.layerStep, totalHeight);
      // Offset at mid slice: the volume of the steps matches that of the ideal chamfer.
      const d = ((zb + zt) / 2 - z0) * slope;
      let section = plan.outer ? tmp(outline.offset(-d, 'Round', 2, ROUND_SEGMENTS)) : outline;
      if (plan.inner) {
        const grown = tmp(channel.offset(d, 'Round', 2, ROUND_SEGMENTS));
        section = tmp(section.subtract(grown));
      }
      const simplified = tmp(section.simplify(SLICE_SIMPLIFY));
      parts.push(tmp(tmp(simplified.extrude(zt - zb)).translate([0, 0, zb])));
    }
    return Manifold.union(parts);
  } finally {
    for (const t of temps) t.delete();
  }
}
