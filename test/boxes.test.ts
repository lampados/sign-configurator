import { describe, expect, it } from 'vitest';
import { bomAssembly } from '../src/export/bom';
import { BOXES, BOX_NONE, boxFits, boxNeeds, CONTROLLER_FALLBACK_MM, pickBox } from '../src/parts/boxes';
import { techParams } from '../src/ui/techParams';
import { decodeShare, encodeShare } from '../src/order/share';
import { migrateOrder } from '../src/order/schema';
import { GENERATOR_VERSION } from '../src/config';

const lrs35 = { label: 'LRS-35-5', sizeMm: [99, 82, 30] as [number, number, number] };
const mini = { label: 'GL-C-309WL', sizeMm: CONTROLLER_FALLBACK_MM };

describe('boxes', () => {
  it('footprints: two possible rows, with walls, spacing and air above', () => {
    expect(boxNeeds([lrs35, mini])).toEqual([
      [99 + 60 + 2 * 5 + 10, 82 + 10, 40],
      [99 + 10, 82 + 35 + 2 * 5 + 10, 40],
    ]);
  });

  it('the smallest one that is enough, rotated if needed', () => {
    // 109 × 137 × 40: it fits the 150 × 110 rotated, not the 120 × 80 × 50.
    expect(pickBox([lrs35, mini]).box?.model).toBe('GW44206');
    // Only the controller (plug-in adapter outside): a small box at least 30 mm high is enough.
    const small = pickBox([mini]);
    expect(small.box).not.toBeNull();
    expect(small.box!.innerMm[2]).toBeGreaterThanOrEqual(30);
    expect(boxFits(BOXES.find((b) => b.model === 'GW44204')!, [lrs35, mini])).toBe(false);
  });

  it('manual choice: even too small, but it says so; "none" picks nothing', () => {
    const forced = pickBox([lrs35, mini], 'gw44204');
    expect(forced).toMatchObject({ fits: false, auto: false });
    expect(pickBox([lrs35, mini], BOX_NONE).box).toBeNull();
    expect(pickBox([lrs35, mini], 'boh').auto).toBe(true);
  });

  it('in the bill of materials: the plug-in adapter stays outside, an LRS goes in', () => {
    // 100 LEDs at 12 V: GST60A12, outside the box; inside only the controller.
    const adapter = bomAssembly([], [], 100, 60, 12);
    expect(adapter.supply?.family).toBe('gst60a');
    expect(adapter.box?.contents).toEqual(['GL-C-309WL']);
    // 200 LEDs at 5 V, 15 A: LRS-100-5 in the box together with the controller.
    const lrs = bomAssembly([], [], 200, 60, 5);
    expect(lrs.box?.contents).toEqual(['LRS-100-5', 'GL-C-309WL']);
    expect(lrs.box?.auto).toBe(true);
    expect(lrs.boxWarnings).toEqual([]);
    expect(lrs.boxesThatFit[0]).toBe(lrs.box?.id);
    const tight = bomAssembly([], [], 200, 60, 5, undefined, 'gw44204');
    expect(tight.box?.fits).toBe(false);
    expect(tight.boxWarnings.join(' ')).toContain('GW44204');
    expect(bomAssembly([], [], 0, 60, 5).box).toBeNull();
  });

  it('it goes into the order only if chosen, and survives the link', () => {
    expect(techParams({ numbers: {}, edgeProfile: 'square', box: 'auto' })).toEqual({});
    const params = techParams({ numbers: {}, edgeProfile: 'square', box: 'gw44207' });
    expect(params).toEqual({ BOX_ID: 'gw44207' });
    const order = migrateOrder({
      schemaVersion: 2,
      generatorVersion: GENERATOR_VERSION,
      source: { kind: 'text', text: 'Ciao', fontId: 'sacramento' },
      heightMm: 120,
      color: '#ff2fd6',
      params,
      paths: null,
      crossings: [],
    });
    expect(decodeShare(encodeShare(order).hash ?? '').order?.params).toEqual(params);
    const bad = decodeShare(encodeShare({ ...order, params: { BOX_ID: 'x' } }).hash ?? '');
    expect(bad.order?.params.BOX_ID).toBeUndefined();
  });
});
