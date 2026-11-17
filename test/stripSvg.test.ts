import { describe, expect, it } from 'vitest';
import { COB_5MM, STRIP_PROFILES, WS2812B_30, WS2812B_60, WS2812B_144 } from '../src/config';
import { STRIP_SVG_LENGTH, stripSvg, stripSvgStats } from '../src/ui/stripSvg';

const count = (svg: string, mark: string): number => svg.split(mark).length - 1;

describe('disegno della striscia', () => {
  it('i LED nel tratto seguono la densità', () => {
    expect(stripSvgStats(WS2812B_30).leds).toBe(2);
    expect(stripSvgStats(WS2812B_60).leds).toBe(4);
    expect(stripSvgStats(WS2812B_144).leds).toBe(10);
    expect(stripSvgStats(COB_5MM).leds).toBe(11);
  });

  it('disegna un segno per LED e una linea per punto di taglio', () => {
    for (const strip of STRIP_PROFILES) {
      const svg = stripSvg(strip);
      const stats = stripSvgStats(strip);
      expect(count(svg, 'data-led')).toBe(stats.leds);
      expect(count(svg, 'data-cut')).toBe(stats.cuts);
      expect(stats.cuts).toBeGreaterThanOrEqual(1);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('è in scala: il riquadro è lungo il tratto più i margini, alto quanto la striscia più le quote', () => {
    const [, , w, h] = /viewBox="([\d. ]+)"/.exec(stripSvg(WS2812B_60))![1]!.split(' ').map(Number);
    expect(w).toBeGreaterThan(STRIP_SVG_LENGTH);
    expect(h).toBeCloseTo(WS2812B_60.STRIP_W + 17, 6);
  });

  it('dice se la striscia piega di lato o si taglia', () => {
    expect(stripSvg(WS2812B_60)).toContain('bends 30° per LED, cut beyond');
    expect(stripSvg(WS2812B_144)).toContain('bends 30° per LED, cut beyond');
    expect(stripSvg(COB_5MM)).toContain('bends sideways');
    expect(stripSvg(COB_5MM)).toContain('strip-notch');
    expect(stripSvg(WS2812B_60)).not.toContain('strip-notch');
  });
});
