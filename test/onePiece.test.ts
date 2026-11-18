import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { FontBytesReader } from '../src/fonts/loadFont';
import { DEFAULT_CUSTOMER, type SignOrderV4 } from '../src/order/schema';
import { generateSign, type MeshData } from '../src/worker/generate';

const readPublic: FontBytesReader = async (file) => {
  const b = await readFile(`public/${file}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function order(fontId: string, heightMm: number, params: SignOrderV4['params']): SignOrderV4 {
  return {
    schemaVersion: 4,
    generatorVersion: 'test',
    pricingVersion: null,
    source: { kind: 'text', text: 'Ciao', fontId },
    heightMm,
    sizePreset: null,
    color: '#ff2fd6',
    params,
    paths: null,
    crossings: [],
    customer: { ...DEFAULT_CUSTOMER },
    plate: null,
  };
}

/** Separate solids of a mesh: triangles joined by shared vertices (not by points that touch). */
function pieces(mesh: MeshData): number {
  const count = mesh.vertProperties.length / mesh.numProp;
  const parent = Int32Array.from({ length: count }, (_, i) => i);
  const find = (i: number): number => {
    while (parent[i] !== i) {
      parent[i] = parent[parent[i]!]!;
      i = parent[i]!;
    }
    return i;
  };
  for (let i = 0; i < mesh.mergeFromVert.length; i++) parent[find(mesh.mergeFromVert[i]!)] = find(mesh.mergeToVert[i]!);
  for (let t = 0; t < mesh.triVerts.length; t += 3) {
    const root = find(mesh.triVerts[t]!);
    parent[find(mesh.triVerts[t + 1]!)] = root;
    parent[find(mesh.triVerts[t + 2]!)] = root;
  }
  const roots = new Set<number>();
  for (let t = 0; t < mesh.triVerts.length; t++) roots.add(find(mesh.triVerts[t]!));
  return roots.size;
}

/** Parts of the sign meant to be detached (the dot of the i, a letter of its own): the outer contours. */
function wanted(outline: readonly (readonly [number, number][])[]): number {
  const area = (ring: readonly (readonly [number, number])[]): number =>
    ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length]![1] - ring[(i + 1) % ring.length]![0] * p[1], 0) / 2;
  return outline.filter((ring) => area(ring) > 0).length;
}

// Signs where slots as wide as the channel removed the floor under a piece of wall and
// left it detached from everything (found on 18 November 2026 trying 9 fonts at 4 sizes and 3 strips).
const CASES: [fontId: string, heightMm: number, stripId: string][] = [
  ['sacramento', 80, 'ws2812b-144'],
  ['sacramento', 80, 'ws2812b-60'],
  ['neonderthaw', 120, 'ws2812b-144'],
  ['neonderthaw', 120, 'ws2812b-60'],
  ['neonderthaw', 80, 'cob-5mm'],
];

describe('the printed part is in one piece', () => {
  for (const [fontId, heightMm, stripId] of CASES) {
    it(`${fontId} at ${heightMm} mm with ${stripId}: no detached piece`, async () => {
      const result = await generateSign(order(fontId, heightMm, { STRIP_ID: stripId }), readPublic);
      expect(pieces(result.housingMesh)).toBe(wanted(result.outline));
    }, 180_000);
  }

  it('with the old slots (WIRE_HOLE_D 0) the check finds them: it does not pass by chance', async () => {
    const result = await generateSign(order('neonderthaw', 120, { STRIP_ID: 'ws2812b-60', WIRE_HOLE_D: 0 }), readPublic);
    expect(pieces(result.housingMesh)).toBeGreaterThan(wanted(result.outline));
  }, 180_000);
});
