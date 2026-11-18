import { describe, expect, it } from 'vitest';
import { resolveParams, rMin } from '../src/config';
import type { Point } from '../src/geometry/rasterize';
import { sourceFromPaths } from '../src/geometry/segment';
import { buildStrip } from '../src/geometry/strip';

/**
 * Queste prove riguardano la piega della striscia, quindi usano una striscia che piega: la COB.
 * La predefinita (WS2812B su circuito flessibile) non curva, e qui non direbbe nulla di utile.
 */
const BENDABLE = resolveParams({ STRIP_ID: 'cob-5mm' });

function arc(radius: number, sweepDeg: number): Point[] {
  const n = sweepDeg;
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * ((sweepDeg * Math.PI) / 180);
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return pts;
}

describe('minimum height', () => {
  it('a straight can go down to the cut pitch', () => {
    const model = buildStrip(
      {
        nodes: [
          { id: 0, x: 0, y: 0, degree: 1 },
          { id: 1, x: 100, y: 0, degree: 1 },
        ],
        edges: [{ id: 0, a: 0, b: 1, points: [[0, 0], [100, 0]], lengthMm: 100 }],
      },
      BENDABLE,
      100,
    );
    expect(model.suggestion.hasErrors).toBe(false);
    expect(model.suggestion.heightMm).toBe(BENDABLE.CUT_PITCH);
    expect(model.bom.segments[0]?.cutLengthMm).toBe(80);
    // 100 mm meno le due asole da 6: 88 mm di luce.
    expect(model.bom.totalLeds).toBe(Math.round((88 * BENDABLE.LED_PER_M) / 1000));
  });

  it("raises the height until a tight arc reaches R_MIN", () => {
    const pts = arc(10, 180);
    const end = pts[pts.length - 1]!;
    const model = buildStrip(
      {
        nodes: [
          { id: 0, x: pts[0]![0], y: pts[0]![1], degree: 1 },
          { id: 1, x: end[0], y: end[1], degree: 1 },
        ],
        edges: [{ id: 0, a: 0, b: 1, points: pts, lengthMm: Math.PI * 10 }],
      },
      BENDABLE,
      100,
    );
    expect(model.suggestion.hasErrors).toBe(true);
    const expected = 100 * (rMin(BENDABLE) / 10);
    expect(model.suggestion.heightMm).toBeGreaterThan(expected - 20);
    expect(model.suggestion.heightMm).toBeLessThan(expected + 30);
  });

  it('two non-adjacent strokes too close together raise the minimum height', () => {
    const model = buildStrip(
      {
        nodes: [
          { id: 0, x: 0, y: 0, degree: 1 },
          { id: 1, x: 40, y: 0, degree: 1 },
          { id: 2, x: 0, y: 8, degree: 1 },
          { id: 3, x: 40, y: 8, degree: 1 },
        ],
        edges: [
          { id: 0, a: 0, b: 1, points: [[0, 0], [40, 0]], lengthMm: 40 },
          { id: 1, a: 2, b: 3, points: [[0, 8], [40, 8]], lengthMm: 40 },
        ],
      },
      BENDABLE,
      100,
    );
    const limit = BENDABLE.CHANNEL_W + 2 * BENDABLE.WALL + BENDABLE.MIN_GAP;
    const issue = model.issues.find((item) => item.message.startsWith('Outlines merging'));
    expect(issue).toBeTruthy();
    expect(issue!.message).toContain(limit.toFixed(1));
    expect(issue!.y).toBeCloseTo(4, 0);
    const needed = Math.ceil((100 * limit) / 8 - 1e-9);
    expect(model.suggestion.heightMm).toBe(needed);
  });

  it('a right angle is not a merged outline, not even when split in two', () => {
    const one = buildStrip(sourceFromPaths([{ points: [[0, 0], [40, 0], [40, 40]] }]), BENDABLE, 100);
    expect(one.issues.some((issue) => issue.message.startsWith('Outlines merging'))).toBe(false);
    const two = buildStrip(
      {
        nodes: [
          { id: 0, x: 0, y: 0, degree: 1 },
          { id: 1, x: 40, y: 0, degree: 2 },
          { id: 2, x: 40, y: 40, degree: 1 },
        ],
        edges: [
          { id: 0, a: 0, b: 1, points: [[0, 0], [40, 0]], lengthMm: 40 },
          { id: 1, a: 1, b: 2, points: [[40, 0], [40, 40]], lengthMm: 40 },
        ],
      },
      BENDABLE,
      100,
    );
    expect(two.issues.some((issue) => issue.message.startsWith('Outlines merging'))).toBe(false);
  });

  it('a T junction is not a merged outline and does not constrain the height', () => {
    const model = buildStrip(
      {
        nodes: [
          { id: 0, x: 0, y: 0, degree: 1 },
          { id: 1, x: 50, y: 0, degree: 3 },
          { id: 2, x: 100, y: 0, degree: 1 },
          { id: 3, x: 50, y: 60, degree: 1 },
        ],
        edges: [
          { id: 0, a: 0, b: 1, points: [[0, 0], [50, 0]], lengthMm: 50 },
          { id: 1, a: 1, b: 2, points: [[50, 0], [100, 0]], lengthMm: 50 },
          { id: 2, a: 1, b: 3, points: [[50, 0], [50, 60]], lengthMm: 60 },
        ],
      },
      BENDABLE,
      100,
    );
    expect(model.chains.length).toBe(2);
    expect(model.issues.some((issue) => issue.message.startsWith('Outlines merging'))).toBe(false);
    expect(model.suggestion.heightMm).toBeLessThan(100);
  });

  it('a narrow T merges beyond the contact, and scale separates it', () => {
    // Il ramo parte dalla T a 10° dall'asta: lontano dal contatto i due tratti restano vicini.
    const deg = (10 * Math.PI) / 180;
    const tip: Point = [50 + 80 * Math.cos(deg), 80 * Math.sin(deg)];
    const model = buildStrip(
      {
        nodes: [
          { id: 0, x: 0, y: 0, degree: 1 },
          { id: 1, x: 50, y: 0, degree: 3 },
          { id: 2, x: 150, y: 0, degree: 1 },
          { id: 3, x: tip[0], y: tip[1], degree: 1 },
        ],
        edges: [
          { id: 0, a: 0, b: 1, points: [[0, 0], [50, 0]], lengthMm: 50 },
          { id: 1, a: 1, b: 2, points: [[50, 0], [150, 0]], lengthMm: 100 },
          { id: 2, a: 1, b: 3, points: [[50, 0], tip], lengthMm: 80 },
        ],
      },
      BENDABLE,
      100,
    );
    const issue = model.issues.find((item) => item.message.startsWith('Outlines merging'));
    expect(issue).toBeTruthy();
    expect(model.suggestion.heightMm).toBeGreaterThan(100);
    expect(model.suggestion.heightMm).toBeLessThan(2000);
  });

  it('a U on the same line is two walls and raises the height', () => {
    const model = buildStrip(
      sourceFromPaths([{ points: [[0, 0], [40, 0], [40, 8], [0, 8]] }]),
      BENDABLE,
      100,
    );
    expect(model.issues.some((issue) => issue.message.startsWith('Outlines merging'))).toBe(true);
  });
});
