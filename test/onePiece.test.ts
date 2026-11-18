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

/** Solidi separati di una mesh: triangoli uniti dai vertici in comune (non da punti che si toccano). */
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

/** Parti dell'insegna volute staccate (il puntino della i, una lettera a sé): i contorni esterni. */
function wanted(outline: readonly (readonly [number, number][])[]): number {
  const area = (ring: readonly (readonly [number, number])[]): number =>
    ring.reduce((sum, p, i) => sum + p[0] * ring[(i + 1) % ring.length]![1] - ring[(i + 1) % ring.length]![0] * p[1], 0) / 2;
  return outline.filter((ring) => area(ring) > 0).length;
}

// Insegne dove le asole larghe quanto il canale toglievano il fondo sotto un pezzo di parete e lo
// lasciavano staccato da tutto (trovate il 18 novembre 2026 provando 9 font a 4 misure e 3 strisce).
const CASES: [fontId: string, heightMm: number, stripId: string][] = [
  ['sacramento', 80, 'ws2812b-144'],
  ['sacramento', 80, 'ws2812b-60'],
  ['neonderthaw', 120, 'ws2812b-144'],
  ['neonderthaw', 120, 'ws2812b-60'],
  ['neonderthaw', 80, 'cob-5mm'],
];

describe('il pezzo stampato è intero', () => {
  for (const [fontId, heightMm, stripId] of CASES) {
    it(`${fontId} a ${heightMm} mm con ${stripId}: nessun pezzo staccato`, async () => {
      const result = await generateSign(order(fontId, heightMm, { STRIP_ID: stripId }), readPublic);
      expect(pieces(result.housingMesh)).toBe(wanted(result.outline));
    }, 180_000);
  }

  it('con le asole di prima (WIRE_HOLE_D 0) il controllo li trova: non passa per caso', async () => {
    const result = await generateSign(order('neonderthaw', 120, { STRIP_ID: 'ws2812b-60', WIRE_HOLE_D: 0 }), readPublic);
    expect(pieces(result.housingMesh)).toBeGreaterThan(wanted(result.outline));
  }, 180_000);
});
