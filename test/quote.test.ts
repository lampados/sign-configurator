import { readFile } from 'node:fs/promises';
import { describe, expect, it } from 'vitest';
import { controllerOf, STRIP_PROFILES, stripProfileOf } from '../src/config';
import type { FontBytesReader } from '../src/fonts/loadFont';
import { DEFAULT_CUSTOMER, type SignOrderV4 } from '../src/order/schema';
import { quoteSign } from '../src/order/quote';
import { MARGIN, STRIP_WASTE_FACTOR } from '../src/pricing';
import { generateSign } from '../src/worker/generate';

const readPublic: FontBytesReader = async (file) => {
  const b = await readFile(`public/${file}`);
  return b.buffer.slice(b.byteOffset, b.byteOffset + b.byteLength) as ArrayBuffer;
};

function order(params: SignOrderV4['params'], plate: SignOrderV4['plate'] = null): SignOrderV4 {
  return {
    schemaVersion: 4,
    generatorVersion: 'test',
    pricingVersion: null,
    source: { kind: 'text', text: 'Ciao', fontId: 'beon' },
    heightMm: 180,
    sizePreset: null,
    color: '#ff2fd6',
    params,
    paths: null,
    crossings: [],
    customer: { ...DEFAULT_CUSTOMER },
    plate,
  };
}

const amount = (quote: ReturnType<typeof quoteSign>, id: string): number => quote.breakdown.find((line) => line.id === id)!.amount;

describe('line-by-line price of the sign (SPEC §12.5)', () => {
  it('the lines come from the bill of materials and the catalogues, and add up to the total', async () => {
    const result = await generateSign(order({ STRIP_ID: 'ws2812b-60' }), readPublic);
    const quote = quoteSign({ bom: result.bom, widthMm: 400, stripId: 'ws2812b-60' });
    expect(quote.stripPriced).toBe(true);
    expect(amount(quote, 'controller')).toBe(controllerOf(undefined).priceEur);
    // La striscia: il tracciato più il 20 %, al prezzo al metro del profilo.
    const stripMm = result.bom.segments.reduce((sum, segment) => sum + segment.cutLengthMm, 0);
    expect(quote.stripM).toBeCloseTo((stripMm / 1000) * STRIP_WASTE_FACTOR, 2);
    expect(amount(quote, 'strip')).toBeCloseTo(quote.stripM * 5.2, 1);
    expect(amount(quote, 'print')).toBe(7);
    // Montaggio: 1 € al minuto, gli stessi minuti del riepilogo.
    expect(quote.assemblyMin).toBe(result.bom.assembly.assemblyMin);
    expect(amount(quote, 'segments')).toBe(result.bom.assembly.assemblyMin);
    expect(amount(quote, 'supply')).toBeGreaterThan(0);
    expect(amount(quote, 'plate')).toBe(0);
    const parts = ['controller', 'strip', 'print', 'segments', 'joints', 'supply', 'box', 'plate'].reduce((sum, id) => sum + amount(quote, id), 0);
    expect(amount(quote, 'margin')).toBeCloseTo(parts * (MARGIN - 1), 2);
    expect(quote.breakdown.reduce((sum, line) => sum + line.amount, 0)).toBeCloseTo(quote.total, 2);
    expect(quote.total % 5).toBe(0);
    expect(quote.shipping).toBe(20);
  }, 180_000);

  it('controller and backdrop change their lines', async () => {
    const result = await generateSign(order({ STRIP_ID: 'ws2812b-60' }), readPublic);
    const base = quoteSign({ bom: result.bom, widthMm: 400, stripId: 'ws2812b-60' });
    const xiao = quoteSign({ bom: result.bom, widthMm: 400, stripId: 'ws2812b-60', controllerId: 'xiao-led-driver' });
    expect(amount(xiao, 'controller')).toBe(18);
    expect(amount(base, 'controller') - amount(xiao, 'controller')).toBe(17);
    // Sopra i 70 cm la stampa costa 14 €.
    expect(amount(quoteSign({ bom: result.bom, widthMm: 800, stripId: 'ws2812b-60' }), 'print')).toBe(14);
    const wood = await generateSign(order({ STRIP_ID: 'ws2812b-60' }, { shape: 'rect', material: 'wood', marginMm: 20, cornerRMm: 10 }), readPublic);
    expect(amount(quoteSign({ bom: wood.bom, widthMm: 400, stripId: 'ws2812b-60' }), 'plate')).toBe(18);
  }, 240_000);

  it('a strip without a price per metre says so: line at zero, total without the strip', async () => {
    const unpriced = STRIP_PROFILES.find((profile) => profile.eurPerM === null)!;
    expect(stripProfileOf('ws2812b-60').eurPerM).toBe(5.2);
    expect(stripProfileOf('cob-5mm').eurPerM).toBe(5.14);
    // La striscia standard ha il suo prezzo: chi apre il sito vede un totale completo.
    expect(stripProfileOf(undefined).id).toBe('ws2812b-144');
    expect(stripProfileOf(undefined).eurPerM).toBe(20);
    const result = await generateSign(order({ STRIP_ID: unpriced.id }), readPublic);
    const quote = quoteSign({ bom: result.bom, widthMm: 400, stripId: unpriced.id });
    expect(quote.stripPriced).toBe(false);
    expect(amount(quote, 'strip')).toBe(0);
    expect(quote.stripM).toBeGreaterThan(0);
  }, 180_000);
});
