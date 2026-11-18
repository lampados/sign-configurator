import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { ASSEMBLY_FULL_CUTS, ASSEMBLY_MIN_PER_CUT, ASSEMBLY_MIN_PER_EXTRA_CUT, assemblyMinutes } from '../src/config';
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

describe('cuts on bends and assembly time', () => {
  it('the first 5 cuts count 10 minutes each, the following ones 4', () => {
    expect([ASSEMBLY_MIN_PER_CUT, ASSEMBLY_FULL_CUTS, ASSEMBLY_MIN_PER_EXTRA_CUT]).toEqual([10, 5, 4]);
    expect(assemblyMinutes(0)).toBe(0);
    expect(assemblyMinutes(1)).toBe(10);
    expect(assemblyMinutes(5)).toBe(50);
    expect(assemblyMinutes(6)).toBe(54);
    expect(assemblyMinutes(41)).toBe(194);
    expect(assemblyMinutes(-3)).toBe(0);
  });

  it('the WS2812B 60 LED/m on a cursive is cut: cuts and jumpers count the tiered minutes', async () => {
    const result = await generateSign(order({ STRIP_ID: 'ws2812b-60' }), readPublic);
    const { bendCuts, assemblyMin } = result.bom.assembly;
    // Threshold of 30° per joint: the cuts in the tight curls stay, not one per LED.
    expect(bendCuts).toBeGreaterThan(0);
    expect(bendCuts).toBeLessThan(result.bom.assembly.totalLeds / 2);
    // Cuts on bends and jumpers count the same.
    expect(assemblyMin).toBe(assemblyMinutes(bendCuts + result.bom.assembly.jumpers));
    expect(result.bom.assembly.jumpers).toBeGreaterThan(0);
    // Cutting is allowed: the curve is no longer an error of the strip.
    expect(result.warnings.join('\n')).not.toMatch(/does not bend sideways/);
  }, 120_000);

  it('the COB follows the curves: no cuts', async () => {
    const result = await generateSign(order({ STRIP_ID: 'cob-5mm' }), readPublic);
    expect(result.bom.assembly.bendCuts).toBe(0);
    expect(result.bom.assembly.assemblyMin).toBe(0);
  }, 120_000);

  it('more LEDs per metre, shorter pieces, more cuts', async () => {
    const coarse = await generateSign(order({ STRIP_ID: 'ws2812b-30' }), readPublic);
    const fine = await generateSign(order({ STRIP_ID: 'ws2812b-144' }), readPublic);
    expect(fine.bom.assembly.bendCuts).toBeGreaterThan(coarse.bom.assembly.bendCuts);
  }, 240_000);
});
