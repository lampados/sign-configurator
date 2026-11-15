import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import type { FontBytesReader } from '../src/fonts/loadFont';
import { getFont } from '../src/fonts/registry';
import { DEFAULT_CUSTOMER, type SignOrderV4 } from '../src/order/schema';
import { generateSign } from '../src/worker/generate';

const readPublic: FontBytesReader = async (file) => {
  const b = await readFile(`public/${file}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

const NEW_FONTS = ['beon', 'pecita', 'compagnon-italic', 'primer-print', 'wire-one'] as const;

describe('font latini aggiunti', () => {
  for (const fontId of NEW_FONTS) {
    it(`${fontId}: «Ciao» a 25 cm dà un pezzo stampabile`, async () => {
      expect(getFont(fontId)).toBeDefined();
      const order: SignOrderV4 = {
        schemaVersion: 4,
        generatorVersion: 'test',
        pricingVersion: null,
        source: { kind: 'text', text: 'Ciao', fontId },
        heightMm: 250,
        sizePreset: null,
        color: '#ff2fd6',
        params: {},
        paths: null,
        crossings: [],
        customer: { ...DEFAULT_CUSTOMER },
        plate: null,
      };
      const result = await generateSign(order, readPublic);
      expect(result.housingMesh.triVerts.length).toBeGreaterThan(0);
      expect(result.bom.assembly.totalLeds).toBeGreaterThan(10);
      expect(result.bom.assembly.segments).toBeGreaterThanOrEqual(3);
    }, 180_000);
  }
});
