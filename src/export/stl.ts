// [J] Binary STL export (SPEC §5).
import type { Manifold } from 'manifold-3d';

/** Subset of manifold-3d `Mesh` needed for the export: the first 3 properties are x, y, z. */
export interface StlMesh {
  numProp: number;
  vertProperties: Float32Array;
  triVerts: Uint32Array;
}

const HEADER_BYTES = 80;
const TRI_BYTES = 50;

/**
 * Binary little-endian STL: 80-byte header, number of triangles (uint32), then for every
 * triangle normal + 3 vertices (12 float32) and attribute (uint16). Units: millimetres.
 */
export function meshToStl(mesh: StlMesh, header = 'sign-configurator binary STL, mm'): ArrayBuffer {
  const { numProp, vertProperties: v, triVerts: t } = mesh;
  const triCount = Math.floor(t.length / 3);
  const buffer = new ArrayBuffer(HEADER_BYTES + 4 + TRI_BYTES * triCount);
  const view = new DataView(buffer);

  // The header must not start with "solid": some readers would mistake it for an ASCII STL.
  const headerBytes = new TextEncoder().encode(header).subarray(0, HEADER_BYTES);
  new Uint8Array(buffer, 0, HEADER_BYTES).set(headerBytes);
  view.setUint32(HEADER_BYTES, triCount, true);

  let off = HEADER_BYTES + 4;
  for (let tri = 0; tri < triCount; tri++) {
    const a = t[3 * tri]! * numProp;
    const b = t[3 * tri + 1]! * numProp;
    const c = t[3 * tri + 2]! * numProp;
    const ax = v[a]!, ay = v[a + 1]!, az = v[a + 2]!;
    const bx = v[b]!, by = v[b + 1]!, bz = v[b + 2]!;
    const cx = v[c]!, cy = v[c + 1]!, cz = v[c + 2]!;

    const ux = bx - ax, uy = by - ay, uz = bz - az;
    const wx = cx - ax, wy = cy - ay, wz = cz - az;
    let nx = uy * wz - uz * wy;
    let ny = uz * wx - ux * wz;
    let nz = ux * wy - uy * wx;
    const len = Math.hypot(nx, ny, nz);
    if (len > 0) {
      nx /= len;
      ny /= len;
      nz /= len;
    }

    for (const value of [nx, ny, nz, ax, ay, az, bx, by, bz, cx, cy, cz]) {
      view.setFloat32(off, value, true);
      off += 4;
    }
    view.setUint16(off, 0, true);
    off += 2;
  }
  return buffer;
}

/** Binary STL straight from a Manifold (it does not free it: it stays the caller's). */
export function manifoldToStl(manifold: Manifold, header?: string): ArrayBuffer {
  return meshToStl(manifold.getMesh(), header);
}
