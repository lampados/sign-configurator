import { describe, expect, it } from 'vitest';
import { resolveParams } from '../src/config';
import { liveCheck } from '../src/editor/liveCheck';
import type { Point } from '../src/geometry/rasterize';

// Live validation talks about curves: a strip that curves is needed.
const params = resolveParams({ WALL: 2.2, STRIP_ID: 'cob-5mm' });

function arc(radius: number): Point[] {
  const points: Point[] = [];
  for (let i = 0; i <= 48; i++) {
    const angle = (i / 48) * Math.PI;
    points.push([radius * Math.cos(angle), radius * Math.sin(angle)]);
  }
  return points;
}

describe('live validation', () => {
  it('a straight line does not block sending', () => {
    const report = liveCheck([{ id: 'p1', points: [[0, 0], [80, 0]], closed: false }], [], params);
    expect(report.blocked).toBe(false);
    expect(report.markers).toEqual([]);
  });

  it('an arc under R_MIN is a curve and blocks', () => {
    const report = liveCheck([{ id: 'p1', points: arc(8), closed: false }], ['p1'], params);
    expect(report.markers.some((marker) => marker.kind === 'curva')).toBe(true);
    expect(report.blocked).toBe(true);
  });

  it('two parallel strokes too close together are a merge', () => {
    const report = liveCheck(
      [
        { id: 'p1', points: [[0, 0], [80, 0]], closed: false },
        { id: 'p2', points: [[10, 4], [70, 4]], closed: false },
      ],
      ['p2'],
      params,
    );
    expect(report.markers.some((marker) => marker.kind === 'fusione' && marker.pathId === 'p2')).toBe(true);
    expect(report.blocked).toBe(true);
  });

  it('the same input gives the same markers', () => {
    const segments = [{ id: 'p1', points: arc(8), closed: false }];
    expect(liveCheck(segments, [], params)).toEqual(liveCheck(segments, [], params));
  });
});
