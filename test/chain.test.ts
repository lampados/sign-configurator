import { describe, expect, it } from 'vitest';
import { resolveParams, rMin } from '../src/config';
import { resampleChain, type ChainHinge } from '../src/geometry/chain';
import type { Point } from '../src/geometry/rasterize';

/**
 * Queste prove riguardano la piega della striscia, quindi usano una striscia che piega: la COB.
 * La predefinita (WS2812B su circuito flessibile) non curva, e qui non direbbe nulla di utile.
 */
const BENDABLE = resolveParams({ STRIP_ID: 'cob-5mm' });

const PITCH = BENDABLE.HINGE_PITCH;

const dist = (a: Point, b: Point): number => Math.hypot(b[0] - a[0], b[1] - a[1]);

/** Arco di cerchio di raggio noto, dal punto (R, 0), in senso antiorario. */
function circularArc(radius: number, sweepDeg: number, stepDeg = 0.5): Point[] {
  const n = Math.max(2, Math.round(sweepDeg / stepDeg));
  const pts: Point[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (i / n) * ((sweepDeg * Math.PI) / 180);
    pts.push([radius * Math.cos(a), radius * Math.sin(a)]);
  }
  return pts;
}

function turnDeg(radius: number, pitch: number): number {
  return (2 * Math.asin(pitch / (2 * radius)) * 180) / Math.PI;
}

/** Cerniere le cui due corde sono un passo intero: l'ultima, più corta, non conta. */
function fullHinges(points: readonly Point[], hinges: readonly ChainHinge[], pitch: number): ChainHinge[] {
  return hinges.filter((_, k) => {
    const i = k + 1;
    const prev = points[i - 1];
    const cur = points[i];
    const next = points[i + 1];
    if (!prev || !cur || !next) return false;
    return Math.abs(dist(prev, cur) - pitch) < 0.05 && Math.abs(dist(cur, next) - pitch) < 0.05;
  });
}

describe('chain on arcs of known radius', () => {
  it('a straight has chords of HINGE_PITCH, zero angle and a CHANNEL_W channel', () => {
    const chain = resampleChain(
      [
        [0, 0],
        [47, 0],
      ],
      {
        hingePitch: PITCH,
        hingeMaxDeg: BENDABLE.HINGE_MAX_DEG,
        channelW: BENDABLE.CHANNEL_W,
        closed: false,
      },
    );
    expect(chain.points.map((p) => p[0])).toEqual([0, 10, 20, 30, 40, 47]);
    expect(chain.points.every((p) => p[1] === 0)).toBe(true);
    expect(chain.lengthMm).toBeCloseTo(47, 6);
    expect(chain.maxAngleDeg).toBeLessThan(0.01);
    expect(chain.minRadiusMm).toBeNull();
    for (const hinge of chain.hinges) {
      expect(hinge.angleDeg).toBeLessThan(0.01);
      expect(hinge.radiusMm).toBeNull();
      expect(hinge.sagittaMm).toBe(0);
      expect(hinge.channelWMm).toBe(BENDABLE.CHANNEL_W);
      expect(hinge.over).toBe(false);
    }
  });

  it('an arc of radius 40 mm has sagitta p²/8R and a channel of CHANNEL_W + s', () => {
    const radius = 40;
    const chain = resampleChain(circularArc(radius, 120), {
      hingePitch: PITCH,
      hingeMaxDeg: BENDABLE.HINGE_MAX_DEG,
      channelW: BENDABLE.CHANNEL_W,
      closed: false,
    });
    const chords: number[] = [];
    for (let i = 1; i < chain.points.length; i++) chords.push(dist(chain.points[i - 1]!, chain.points[i]!));
    for (let i = 0; i < chords.length - 1; i++) expect(chords[i]).toBeCloseTo(PITCH, 2);
    expect(chords[chords.length - 1]).toBeLessThanOrEqual(PITCH + 1e-6);

    const expectedAngle = turnDeg(radius, PITCH);
    const expectedS = (PITCH * PITCH) / (8 * radius);
    const hinges = fullHinges(chain.points, chain.hinges, PITCH);
    expect(hinges.length).toBeGreaterThan(3);
    for (const hinge of hinges) {
      expect(hinge.angleDeg).toBeCloseTo(expectedAngle, 1);
      expect(hinge.radiusMm).toBeCloseTo(radius, 1);
      expect(hinge.sagittaMm).toBeCloseTo(expectedS, 2);
      expect(hinge.channelWMm).toBeCloseTo(BENDABLE.CHANNEL_W + expectedS, 2);
      expect(hinge.over).toBe(false);
    }
  });

  it("on an arc of radius R_MIN the angle is HINGE_MAX_DEG", () => {
    const radius = rMin(BENDABLE);
    const chain = resampleChain(circularArc(radius, 180), {
      hingePitch: PITCH,
      hingeMaxDeg: BENDABLE.HINGE_MAX_DEG,
      channelW: BENDABLE.CHANNEL_W,
      closed: false,
    });
    const hinges = fullHinges(chain.points, chain.hinges, PITCH);
    expect(hinges.length).toBeGreaterThanOrEqual(2);
    for (const hinge of hinges) {
      expect(hinge.angleDeg).toBeCloseTo(BENDABLE.HINGE_MAX_DEG, 1);
      expect(hinge.radiusMm).toBeCloseTo(radius, 1);
      expect(hinge.over).toBe(false);
    }
  });

  it('an arc tighter than R_MIN exceeds the maximum angle', () => {
    const radius = 10;
    const chain = resampleChain(circularArc(radius, 180), {
      hingePitch: PITCH,
      hingeMaxDeg: BENDABLE.HINGE_MAX_DEG,
      channelW: BENDABLE.CHANNEL_W,
      closed: false,
    });
    const expectedS = (PITCH * PITCH) / (8 * radius);
    const hinges = fullHinges(chain.points, chain.hinges, PITCH);
    expect(hinges.length).toBeGreaterThanOrEqual(2);
    for (const hinge of hinges) {
      expect(hinge.angleDeg).toBeCloseTo(turnDeg(radius, PITCH), 1);
      expect(hinge.angleDeg).toBeGreaterThan(BENDABLE.HINGE_MAX_DEG);
      expect(hinge.radiusMm).toBeCloseTo(radius, 1);
      expect(hinge.sagittaMm).toBeCloseTo(expectedS, 2);
      expect(hinge.channelWMm).toBeCloseTo(BENDABLE.CHANNEL_W + expectedS, 2);
      expect(hinge.over).toBe(true);
    }
  });

  it('is deterministic', () => {
    const arc = circularArc(25, 150, 1);
    const options = {
      hingePitch: PITCH,
      hingeMaxDeg: BENDABLE.HINGE_MAX_DEG,
      channelW: BENDABLE.CHANNEL_W,
      closed: false,
    };
    expect(resampleChain(arc, options)).toEqual(resampleChain(arc, options));
  });
});
