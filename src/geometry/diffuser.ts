// Press-fit diffuser on top of the channel (SPEC §3): channel minus DIFFUSER_CLEARANCE,
// extruded by DIFFUSER_T and resting flush with the top edge. With DIFFUSER_LEDGE the housing passes
// the wider seat instead of the channel, and the diffuser rests on its step.
import type { CrossSection, Manifold, ManifoldToplevel } from 'manifold-3d';
import { totalHeight, type Params } from '../config';

const ROUND_SEGMENTS = 32;

export function diffuserSection(
  channel: CrossSection,
  clearance: number,
): CrossSection {
  if (!(clearance > 0)) return channel;
  return channel.offset(-clearance, 'Round', 2, ROUND_SEGMENTS);
}

/** Solid of the diffuser. It does not free `channel`. */
export function buildDiffuser(
  wasm: ManifoldToplevel,
  channel: CrossSection,
  p: Pick<Params, 'DIFFUSER_T' | 'DIFFUSER_CLEARANCE' | 'FLOOR' | 'CHANNEL_DEPTH'>,
): Manifold {
  const { Manifold } = wasm;
  const section = diffuserSection(channel, p.DIFFUSER_CLEARANCE);
  const thickness = Math.max(p.DIFFUSER_T, 0);
  const solid = section.extrude(Math.max(thickness, 0.01)).translate([0, 0, totalHeight(p) - thickness]);
  if (section !== channel) section.delete();
  if (thickness <= 0) {
    const empty = Manifold.cube([0, 0, 0]);
    solid.delete();
    return empty;
  }
  return solid;
}
