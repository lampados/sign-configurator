import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ASSEMBLY_MIN_PER_CUT } from '../src/config';
import type { FontBytesReader } from '../src/fonts/loadFont';
import { DEFAULT_CUSTOMER, type SignOrderV4 } from '../src/order/schema';
import { generateSign } from '../src/worker/generate';

const readPublic: FontBytesReader = async (file) => {
  const b = await readFile(`public/${file}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function order(params: SignOrderV4['params'], fontId = 'sacramento', text = 'Ciao'): SignOrderV4 {
  return {
    schemaVersion: 4,
    generatorVersion: 'test',
    pricingVersion: null,
    source: { kind: 'text', text, fontId },
    heightMm: 120,
    sizePreset: 'M',
    color: '#ff2fd6',
    params,
    paths: null,
    crossings: [],
    customer: { ...DEFAULT_CUSTOMER },
    plate: null,
  };
}

describe('tagli in curva e tempo di montaggio', () => {
  it('la WS2812B predefinita su un corsivo si taglia: ogni taglio vale 10 minuti', async () => {
    const result = await generateSign(order({}), readPublic);
    const { bendCuts, assemblyMin } = result.bom.assembly;
    expect(bendCuts).toBeGreaterThan(10);
    expect(ASSEMBLY_MIN_PER_CUT).toBe(10);
    expect(assemblyMin).toBe(bendCuts * 10);
    // Tagliare è permesso: la curva non è più un errore della striscia.
    expect(result.warnings.join('\n')).not.toMatch(/non piega di lato/);
  }, 120_000);

  it('la COB segue le curve: nessun taglio', async () => {
    const result = await generateSign(order({ STRIP_ID: 'cob-5mm' }), readPublic);
    expect(result.bom.assembly.bendCuts).toBe(0);
    expect(result.bom.assembly.assemblyMin).toBe(0);
  }, 120_000);

  it('più LED al metro, pezzi più corti, più tagli', async () => {
    const coarse = await generateSign(order({ STRIP_ID: 'ws2812b-30' }), readPublic);
    const fine = await generateSign(order({ STRIP_ID: 'ws2812b-144' }), readPublic);
    expect(fine.bom.assembly.bendCuts).toBeGreaterThan(coarse.bom.assembly.bendCuts);
  }, 240_000);
});
