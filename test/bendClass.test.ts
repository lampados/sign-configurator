import { describe, expect, it } from 'vitest';
import { resolveParams } from '../src/config';
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

/** V a 90° campionata ogni millimetro: il raccordo di Chaikin resta piccolo rispetto al passo. */
function vee(scale: number): Point[] {
  const arm = 40 * scale;
  const pts: Point[] = [];
  for (let t = arm; t > 0; t -= 1) pts.push([-t, t]);
  pts.push([0, 0]);
  for (let t = 1; t <= arm; t += 1) pts.push([t, t]);
  return pts;
}

function ring(cx: number, cy: number, radius: number): Point[] {
  const n = 32;
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * 2 * Math.PI;
    pts.push([cx + radius * Math.cos(a), cy + radius * Math.sin(a)]);
  }
  return pts;
}

describe('bend classification', () => {
  it('an arc of known radius, compared with the ×2 scale, is a curve', () => {
    const pts = arc(10, 180);
    const model = buildStrip(sourceFromPaths([{ points: pts }]), BENDABLE, 100);
    const bends = model.issues.filter((issue) => issue.bend !== null);
    expect(bends.length).toBeGreaterThan(0);
    expect(bends.every((issue) => issue.bend === 'curva')).toBe(true);
  });

  it('a V-shaped cusp stays a cusp at any scale', () => {
    for (const scale of [1, 2, 4]) {
      const model = buildStrip(sourceFromPaths([{ points: vee(scale) }]), { ...BENDABLE, CUSP_MODE: 'warn' }, 100);
      const bends = model.issues.filter((issue) => issue.bend !== null);
      expect(bends.length, `scala ${scale}`).toBeGreaterThan(0);
      expect(bends.every((issue) => issue.bend === 'spigolo'), `scala ${scale}`).toBe(true);
    }
  });

  it('CUSP_MODE split cuts the cusp into two consistent segments', () => {
    const model = buildStrip(
      sourceFromPaths([{ points: vee(1) }]),
      { ...BENDABLE, CUSP_MODE: 'split' },
      100,
    );
    expect(model.chains).toHaveLength(2);
    expect(model.bom.segments).toHaveLength(2);
    expect(model.bom.wireSlots).toBe(2);
    expect(model.bom.corners).toHaveLength(1);
    expect(model.bom.corners[0]!.wireMm).toBe(0);
    expect(model.bom.corners[0]!.segments).toHaveLength(2);
    expect(model.issues.filter((issue) => issue.bend === 'spigolo')).toHaveLength(0);
    for (const chain of model.chains) {
      const ends = [chain.points[0]!, chain.points[chain.points.length - 1]!];
      expect(ends.some((p) => Math.hypot(p[0], p[1]) < 2)).toBe(true);
    }
    const left = model.bom.segments.find((seg) => seg.din[0] < -10 || seg.dout[0] < -10);
    const right = model.bom.segments.find((seg) => seg.din[0] > 10 || seg.dout[0] > 10);
    expect(left).toBeTruthy();
    expect(right).toBeTruthy();
    expect(left!.dinDir[0]).toBeGreaterThan(0.5);
    expect(left!.dinDir[1]).toBeLessThan(-0.5);
    expect(right!.dinDir[0]).toBeGreaterThan(0.5);
    expect(right!.dinDir[1]).toBeGreaterThan(0.5);
  });

  it('I_DOT_MODE dash gives a segment CUT_PITCH long, oriented like the stem', () => {
    const stem: Point[] = [
      [0, 0],
      [0, 40],
    ];
    const model = buildStrip(
      sourceFromPaths([{ points: stem }, { points: ring(0, 48, 12) }]),
      { ...BENDABLE, I_DOT_MODE: 'dash' },
      100,
    );
    const dashes = model.chains.filter((chain) => Math.abs(chain.lengthMm - BENDABLE.CUT_PITCH) < 0.05);
    expect(dashes).toHaveLength(1);
    expect(model.chains).toHaveLength(2);
    const dash = dashes[0]!;
    const a = dash.points[0]!;
    const b = dash.points[dash.points.length - 1]!;
    expect(Math.hypot(b[0] - a[0], b[1] - a[1])).toBeCloseTo(BENDABLE.CUT_PITCH, 1);
    expect(Math.abs(a[0] - b[0])).toBeLessThan(0.5);
    expect((a[1] + b[1]) / 2).toBeCloseTo(48, 0);
    expect(model.issues.some((issue) => issue.message.startsWith('Closed loop excluded'))).toBe(false);
    expect(model.unlit).toHaveLength(0);
  });

  it('a dash that does not fit in the dot becomes a raised shape with no strip', () => {
    const stem: Point[] = [
      [0, 0],
      [0, 40],
    ];
    const model = buildStrip(
      sourceFromPaths([{ points: stem }, { points: ring(0, 48, 2) }]),
      { ...BENDABLE, I_DOT_MODE: 'dash' },
      100,
    );
    expect(model.chains).toHaveLength(1);
    expect(model.unlit).toHaveLength(1);
    const fallback = model.issues.find((issue) => issue.message.startsWith('Dash outside the dot'));
    expect(fallback).toBeTruthy();
    expect(fallback!.x).toBeCloseTo(0, 0);
    expect(fallback!.y).toBeCloseTo(48, 0);
  });

  it('I_DOT_MODE dot is a segment of its own, without wire slots, if the pill fits', () => {
    const stem: Point[] = [
      [0, 0],
      [0, 40],
    ];
    const model = buildStrip(
      sourceFromPaths([{ points: stem }, { points: ring(0, 60, 12) }]),
      { ...BENDABLE, I_DOT_MODE: 'dot' },
      100,
    );
    const dots = model.chains.filter((chain) => chain.dot);
    expect(dots).toHaveLength(1);
    expect(model.unlit).toHaveLength(0);
    expect(Math.abs(dots[0]!.lengthMm - BENDABLE.CUT_PITCH)).toBeLessThan(0.2);
    const bomDot = model.bom.segments.find((segment) => segment.id === dots[0]!.id);
    expect(bomDot).toBeTruthy();
    expect(bomDot!.cutLengthMm).toBe(BENDABLE.CUT_PITCH);
    expect(model.bom.wireSlots).toBe(2);
  });

  it('a dot smaller than the pill stays one LED, with a warning about the overhang', () => {
    const stem: Point[] = [
      [0, 0],
      [0, 30],
    ];
    const model = buildStrip(
      sourceFromPaths([{ points: stem }, { points: ring(0, 48, 2) }]),
      { ...BENDABLE, I_DOT_MODE: 'dot' },
      100,
    );
    const dots = model.chains.filter((chain) => chain.dot);
    expect(dots).toHaveLength(1);
    expect(model.unlit).toHaveLength(0);
    expect(model.bom.segments.find((segment) => segment.id === dots[0]!.id)?.ledCount).toBe(1);
    const note = model.issues.find((issue) => issue.message.startsWith('Dot smaller than the LED pill'));
    expect(note).toBeTruthy();
    expect(note!.level).toBe('warning');
    expect(note!.y).toBeCloseTo(48, 0);
    expect(model.issues.some((issue) => issue.message.startsWith('Dot too small'))).toBe(false);
  });

  it('a short isolated accent becomes a pill with one LED, without wire slots', () => {
    const stem: Point[] = [
      [0, 0],
      [0, 40],
    ];
    const accent: Point[] = [
      [-4, 52],
      [6, 60],
    ];
    const short: Point[] = [
      [20, 52],
      [24, 55],
    ];
    const model = buildStrip(
      sourceFromPaths([{ points: stem }, { points: accent }, { points: short }]),
      { ...BENDABLE, I_DOT_MODE: 'dot' },
      100,
    );
    const marks = model.chains.filter((chain) => chain.dot);
    expect(marks).toHaveLength(2);
    for (const mark of marks) {
      expect(mark.lengthMm).toBeGreaterThanOrEqual(BENDABLE.CUT_PITCH - 0.2);
      expect(model.bom.segments.find((segment) => segment.id === mark.id)?.ledCount).toBe(1);
    }
    expect(model.issues.some((issue) => issue.message.includes('under the cut pitch'))).toBe(false);
    expect(model.bom.wireSlots).toBe(2);
  });
});
