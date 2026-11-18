import { describe, expect, it } from 'vitest';
import { SHARE_LINK_MAX_BYTES, decodeShare, encodeShare } from '../src/order/share';
import { migrateOrder, type SignOrder } from '../src/order/schema';

function sample(): SignOrder {
  return {
    schemaVersion: 2,
    generatorVersion: '0.2.0',
    source: { kind: 'text', text: 'Città', fontId: 'sacramento' },
    heightMm: 120,
    color: '#ff2fd6',
    params: { WALL: 2.2 },
    paths: null,
    crossings: [],
  };
}

describe('sharing', () => {
  it('hash and order come back identical', () => {
    const order = migrateOrder(sample());
    const link = encodeShare(order);
    expect(link.hash).toMatch(/^#o=[A-Za-z0-9_-]+$/);
    const read = decodeShare(link.hash ?? '');
    expect(read.warnings).toEqual([]);
    expect(read.order).toEqual(order);
    expect(decodeShare(link.json).order).toEqual(order);
  });

  it('a malformed hash gives a warning and does not throw', () => {
    for (const input of ['', '#o=', '#o=%%%', '#o=aaaa', 'non-è-un-link']) {
      const read = decodeShare(input);
      expect(read.order).toBeNull();
      expect(read.warnings.length).toBeGreaterThan(0);
    }
  });

  it('beyond 8 kB there is no link, but there is the json', () => {
    const order = migrateOrder({
      ...sample(),
      source: { kind: 'text', text: 'x'.repeat(20_000), fontId: 'sacramento' },
    });
    const link = encodeShare(order);
    expect(link.bytes).toBeGreaterThan(SHARE_LINK_MAX_BYTES);
    expect(link.hash).toBeNull();
    expect(decodeShare(link.json).order).toEqual(order);
  });

  it('an out-of-range value is clamped to the limit and an unknown field is ignored', () => {
    const order = migrateOrder(sample());
    const json = JSON.stringify({ ...order, heightMm: 2000, email: 'a@b.c' });
    const read = decodeShare(json);
    expect(read.order?.heightMm).toBe(800);
    expect(read.warnings.some((warning) => warning.includes('Height'))).toBe(true);
    expect(read.warnings.some((warning) => warning.includes('email'))).toBe(true);
    expect(JSON.stringify(read.order)).not.toContain('email');
  });

  it('out-of-range margin and radius are clamped to the limit; unknown shape or material removes the backdrop', () => {
    const order = migrateOrder(sample());
    const wide = decodeShare(JSON.stringify({
      ...order,
      plate: { shape: 'rect', material: 'clear', marginMm: 80, cornerRMm: -2 },
    }));
    expect(wide.order?.plate).toEqual({ shape: 'rect', material: 'clear', marginMm: 60, cornerRMm: 0 });
    expect(wide.warnings.some((warning) => warning.includes('margin'))).toBe(true);
    expect(wide.warnings.some((warning) => warning.includes('radius'))).toBe(true);

    const raw = JSON.parse(JSON.stringify(order)) as { customer: { effect: string }; plate?: unknown };
    raw.customer.effect = 'fisso';
    raw.plate = { shape: 'round', material: 'glass', marginMm: 20, cornerRMm: 8 };
    const unknown = decodeShare(JSON.stringify(raw));
    expect(unknown.order?.plate).toBeNull();
    expect(unknown.order?.customer.effect).toBe('colore fisso');
    expect(unknown.warnings.some((warning) => warning.includes('backdrop'))).toBe(true);
    expect(unknown.warnings.some((warning) => warning.includes('effect'))).toBe(true);

    // The animated effects travel with the design.
    for (const effect of ['arcobaleno', 'respiro', 'scia', 'scintille']) {
      raw.customer.effect = effect;
      const kept = decodeShare(JSON.stringify(raw));
      expect(kept.order?.customer.effect).toBe(effect);
      expect(kept.warnings.some((warning) => warning.includes('effect'))).toBe(false);
    }
  });
});
