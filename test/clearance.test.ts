import { describe, expect, it } from 'vitest';
import { resolveParams } from '../src/config';
import type { Point } from '../src/geometry/rasterize';
import { centerlineClearance } from '../src/geometry/validate';

const P = resolveParams(); // WS2812B 60 LED/m: striscia da 10 mm, canale da 10,4
const LIMIT = P.CHANNEL_W + 2 * P.WALL + P.MIN_GAP;

/** Un tratto che sale, fa un occhiello stretto e ridiscende incrociando se stesso in (50, 50). */
const LOOP: Point[] = [
  [0, 0],
  [45, 20],
  [55, 80],
  [56, 100],
  [50, 112],
  [44, 100],
  [45, 80],
  [55, 20],
  [100, 0],
];
const parallel = (gap: number) => [
  { points: [[0, 0], [80, 0]] as Point[] },
  { points: [[0, gap], [80, gap]] as Point[] },
];

describe('close strokes', () => {
  it('a stroke that crosses itself is not a defect around the crossing', () => {
    const bare = centerlineClearance([{ points: LOOP }], P, []);
    // Senza sapere dell'incrocio i due rami sembrano fusi: è il falso allarme di «MedMusa».
    expect(bare).not.toBeNull();
    expect(bare!.distance).toBeLessThan(2);

    const known = centerlineClearance([{ points: LOOP }], P, [[50, 50]]);
    // Con l'incrocio noto resta solo quello che è lontano dall'incrocio più di un limite.
    if (known) {
      expect(Math.hypot(known.x - 50, known.y - 50)).toBeGreaterThan(LIMIT * 0.9);
      expect(known.distance).toBeGreaterThan(5);
    }
  });

  it('two strips side by side fit: no jumper', () => {
    const clash = centerlineClearance(parallel(12), P, []);
    expect(clash).not.toBeNull();
    expect(clash!.distance).toBeCloseTo(12, 6);
    expect(clash!.overlaps).toBe(0);
  });

  it('closer than the strip width: one jumper per zone', () => {
    const one = centerlineClearance(parallel(6), P, []);
    expect(one!.overlaps).toBe(1);
    // Due zone lontane fra loro sono due ponticelli.
    const two = centerlineClearance(
      [
        { points: [[0, 0], [20, 0]] as Point[] },
        { points: [[0, 6], [20, 6]] as Point[] },
        { points: [[200, 0], [220, 0]] as Point[] },
        { points: [[200, 6], [220, 6]] as Point[] },
      ],
      P,
      [],
    );
    expect(two!.overlaps).toBe(2);
  });

  it('farther apart than the limit: nothing to report', () => {
    expect(centerlineClearance(parallel(LIMIT + 1), P, [])).toBeNull();
  });
});
