// Which faces of the housing a Tech parameter refers to (SPEC §12.2, "Pointing at a parameter"):
// the inner walls of the channel and the floor. Pure module: no DOM, no three.js.

export interface ChannelInfo {
  /** Centrelines of the strip pieces, mm, in the plane of the sign. */
  centerlines: readonly (readonly (readonly [number, number])[])[];
  /** FLOOR: Z of the channel floor. */
  floor: number;
  /** CHANNEL_W. */
  width: number;
  /** WALL. */
  wall: number;
  /** Z of the top edge: FLOOR + CHANNEL_DEPTH. */
  top: number;
}

export const PART_OTHER = 0;
/** Inner walls of the channel: what CHANNEL_DEPTH makes taller. */
export const PART_WALL = 1;
/** Top face of the floor and the walls of the holes through it: what FLOOR makes thicker. */
export const PART_FLOOR = 2;

interface MeshLike {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

const Z_EPS = 0.05;

/** One class per triangle. Without centrelines everything is `PART_OTHER`. */
export function classifyHousing(mesh: MeshLike, channel: ChannelInfo): Uint8Array {
  const triangles = Math.floor(mesh.triVerts.length / 3);
  const parts = new Uint8Array(triangles);
  const reach = channel.width / 2 + channel.wall + 1;
  const cell = Math.max(2 * reach, 4);
  // Grid of the centreline segments, each one in every cell it can be the nearest for.
  const grid = new Map<string, number[]>();
  const segments: number[] = [];
  for (const line of channel.centerlines) {
    for (let i = 0; i + 1 < line.length; i++) {
      const a = line[i]!;
      const b = line[i + 1]!;
      const id = segments.length / 4;
      segments.push(a[0], a[1], b[0], b[1]);
      const x0 = Math.floor((Math.min(a[0], b[0]) - reach) / cell);
      const x1 = Math.floor((Math.max(a[0], b[0]) + reach) / cell);
      const y0 = Math.floor((Math.min(a[1], b[1]) - reach) / cell);
      const y1 = Math.floor((Math.max(a[1], b[1]) + reach) / cell);
      for (let gx = x0; gx <= x1; gx++) {
        for (let gy = y0; gy <= y1; gy++) {
          const key = `${gx},${gy}`;
          const list = grid.get(key);
          if (list) list.push(id);
          else grid.set(key, [id]);
        }
      }
    }
  }
  if (segments.length === 0) return parts;

  /** Nearest point of the centrelines, within `reach`. */
  const nearest = (x: number, y: number): { dx: number; dy: number; dist: number } | null => {
    const list = grid.get(`${Math.floor(x / cell)},${Math.floor(y / cell)}`);
    if (!list) return null;
    let best = reach;
    let found: { dx: number; dy: number; dist: number } | null = null;
    for (const id of list) {
      const ax = segments[id * 4]!;
      const ay = segments[id * 4 + 1]!;
      const ux = segments[id * 4 + 2]! - ax;
      const uy = segments[id * 4 + 3]! - ay;
      const len2 = ux * ux + uy * uy;
      const t = len2 > 0 ? Math.min(1, Math.max(0, ((x - ax) * ux + (y - ay) * uy) / len2)) : 0;
      const dx = ax + ux * t - x;
      const dy = ay + uy * t - y;
      const dist = Math.hypot(dx, dy);
      if (dist <= best) {
        best = dist;
        found = { dx, dy, dist };
      }
    }
    return found;
  };

  const v = mesh.vertProperties;
  const n = mesh.numProp;
  for (let t = 0; t < triangles; t++) {
    const a = mesh.triVerts[t * 3]! * n;
    const b = mesh.triVerts[t * 3 + 1]! * n;
    const c = mesh.triVerts[t * 3 + 2]! * n;
    const ax = v[a]!, ay = v[a + 1]!, az = v[a + 2]!;
    const e1x = v[b]! - ax, e1y = v[b + 1]! - ay, e1z = v[b + 2]! - az;
    const e2x = v[c]! - ax, e2y = v[c + 1]! - ay, e2z = v[c + 2]! - az;
    let nx = e1y * e2z - e1z * e2y;
    let ny = e1z * e2x - e1x * e2z;
    let nz = e1x * e2y - e1y * e2x;
    const len = Math.hypot(nx, ny, nz);
    if (!(len > 0)) continue;
    nx /= len;
    ny /= len;
    nz /= len;
    const cx = ax + (e1x + e2x) / 3;
    const cy = ay + (e1y + e2y) / 3;
    const cz = az + (e1z + e2z) / 3;
    if (nz > 0.9) {
      // Facing up, at the height of the floor: the bottom of the channel.
      if (Math.abs(cz - channel.floor) < Z_EPS && nearest(cx, cy)) parts[t] = PART_FLOOR;
      continue;
    }
    if (Math.abs(nz) > 0.5) continue;
    const near = nearest(cx, cy);
    if (!near) continue;
    if (cz > channel.floor + Z_EPS) {
      // Above the floor, facing the centreline: inside the channel. The outer wall faces away.
      if (nx * near.dx + ny * near.dy > 0) parts[t] = PART_WALL;
    } else if (cz > Z_EPS && cz < channel.floor - Z_EPS && near.dist < channel.width / 2 + channel.wall / 2) {
      // Inside the floor and under the channel: the wall of a hole, which shows the thickness.
      parts[t] = PART_FLOOR;
    }
  }
  return parts;
}

interface LightLike {
  pos: readonly [number, number, number];
  dir: readonly [number, number, number];
}

/**
 * Where the arrow of CHANNEL_W goes: across the channel at the highest LED, from wall to wall.
 * `null` without LEDs.
 */
export function widthArrow(
  lights: readonly LightLike[],
  width: number,
): { a: [number, number]; b: [number, number] } | null {
  let top: LightLike | null = null;
  for (const light of lights) {
    if (Math.hypot(light.dir[0], light.dir[1]) < 1e-6) continue;
    if (!top || light.pos[1] > top.pos[1]) top = light;
  }
  if (!top || !(width > 0)) return null;
  const len = Math.hypot(top.dir[0], top.dir[1]);
  const px = -top.dir[1] / len;
  const py = top.dir[0] / len;
  const h = width / 2;
  return {
    a: [top.pos[0] - px * h, top.pos[1] - py * h],
    b: [top.pos[0] + px * h, top.pos[1] + py * h],
  };
}
