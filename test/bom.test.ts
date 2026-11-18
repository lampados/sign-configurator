import { describe, expect, it } from 'vitest';
import { resolveParams } from '../src/config';
import { anchorHoleCount, buildBom } from '../src/export/bom';

/**
 * Queste prove riguardano la piega della striscia, quindi usano una striscia che piega: la COB.
 * La predefinita (WS2812B su circuito flessibile) non curva, e qui non direbbe nulla di utile.
 */
const BENDABLE = resolveParams({ STRIP_ID: 'cob-5mm' });

describe('BOM', () => {
  it('rounds down to the cut pitch and counts the LEDs', () => {
    const bom = buildBom(
      [
        {
          id: 1,
          points: [
            [0, 0],
            [25, 0],
          ],
          lengthMm: 25,
          closed: false,
          dot: false,
        },
      ],
      BENDABLE,
      [],
    );
    expect(bom.segments[0]).toMatchObject({
      id: 1,
      lengthMm: 25,
      ledCount: 2,
      cutLengthMm: 10,
      din: [6, 0],
      dout: [19, 0],
      dinDir: [1, 0],
      doutDir: [1, 0],
    });
    expect(bom.totalLeds).toBe(2);
    expect(bom.wireSlots).toBe(2);
    expect(bom.wireSlotW).toBe(BENDABLE.CHANNEL_W);
    expect(bom.wireSlotL).toBe(BENDABLE.WIRE_SLOT_L);
    expect(bom.anchorHoles).toBe(0);
    expect(bom.assembly).toMatchObject({
      segments: 1,
      solderJoints: 2,
      wires: 6,
      corners: 0,
      totalLeds: 2,
      maxCurrentA: 0.12,
      supplyA: 1,
    });
  });

  it('the holes respect the minimum count and the 10 mm clearance', () => {
    expect(anchorHoleCount(15, BENDABLE)).toBe(0);
    expect(anchorHoleCount(50, BENDABLE)).toBe(2);
    expect(anchorHoleCount(200, BENDABLE)).toBe(3);
  });
});
