import { describe, expect, it } from 'vitest';
import { priceOrder, type PriceMeasure } from '../src/pricing';

function atHeight(heightMm: number): PriceMeasure {
  const scale = heightMm / 100;
  return {
    outlineMm2: 4000 * scale * scale,
    widthMm: 300 * scale,
    stripMm: 350 * scale,
    stripEurPerM: 5.2,
    segments: 3,
    solderJoints: 2,
    controllerEur: 35,
    supplyEur: 16,
    boxEur: 9,
  };
}

describe('price', () => {
  it('is deterministic and grows with the height', () => {
    const low = priceOrder(atHeight(100));
    const mid = priceOrder(atHeight(150));
    const high = priceOrder(atHeight(200));
    expect(priceOrder(atHeight(100))).toEqual(low);
    expect(mid.total).toBeGreaterThanOrEqual(low.total);
    expect(high.total).toBeGreaterThan(low.total);
    const sum = high.breakdown.reduce((total, line) => total + line.amount, 0);
    expect(sum).toBeCloseTo(high.total, 2);
  });

  it('printing €7 under 70 cm, €14 above, shipping outside the total', () => {
    const narrow = priceOrder({ ...atHeight(100), widthMm: 600 });
    const wide = priceOrder({ ...atHeight(100), widthMm: 800 });
    expect(narrow.breakdown.find((l) => l.id === 'print')?.amount).toBe(7);
    expect(wide.breakdown.find((l) => l.id === 'print')?.amount).toBe(14);
    expect(narrow.shipping).toBe(20);
  });

  it('the controller comes with its own price: the €18 Seeed board costs less than the €35 standard', () => {
    const line = (eur: number) => priceOrder({ ...atHeight(100), controllerEur: eur }).breakdown.find((l) => l.id === 'controller')?.amount;
    expect(line(35)).toBe(35);
    expect(line(18)).toBe(18);
    expect(priceOrder({ ...atHeight(200), controllerEur: 18 }).total).toBeLessThan(priceOrder({ ...atHeight(200), controllerEur: 44 }).total);
  });
});
