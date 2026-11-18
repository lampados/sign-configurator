import { describe, expect, it } from 'vitest';
import { COB_5MM, STRIP_PROFILES, WS2812B_30, WS2812B_60, WS2812B_144 } from '../src/config';
import { STRIP_SVG_LENGTH, stripSvg, stripSvgStats } from '../src/ui/stripSvg';

const count = (svg: string, mark: string): number => svg.split(mark).length - 1;

describe('strip drawing', () => {
  it('the LEDs in the stretch follow the density', () => {
    expect(stripSvgStats(WS2812B_30).leds).toBe(2);
    expect(stripSvgStats(WS2812B_60).leds).toBe(4);
    expect(stripSvgStats(WS2812B_144).leds).toBe(10);
    expect(stripSvgStats(COB_5MM).leds).toBe(11);
  });

  it('draws one mark per LED and one line per cut point', () => {
    for (const strip of STRIP_PROFILES) {
      const svg = stripSvg(strip);
      const stats = stripSvgStats(strip);
      expect(count(svg, 'data-led')).toBe(stats.leds);
      expect(count(svg, 'data-cut')).toBe(stats.cuts);
      expect(stats.cuts).toBeGreaterThanOrEqual(1);
      expect(svg).not.toMatch(/NaN|undefined/);
    }
  });

  it('is to scale: the box is as long as the stretch plus margins, as tall as the strip plus dimensions', () => {
    const [, , w, h] = /viewBox="([\d. ]+)"/.exec(stripSvg(WS2812B_60))![1]!.split(' ').map(Number);
    expect(w).toBeGreaterThan(STRIP_SVG_LENGTH);
    expect(h).toBeCloseTo(WS2812B_60.STRIP_W + 17, 6);
  });

  it('says whether the strip bends sideways or is cut', () => {
    expect(stripSvg(WS2812B_60)).toContain('bends 30° per LED, cut beyond');
    expect(stripSvg(WS2812B_144)).toContain('bends 30° per LED, cut beyond');
    expect(stripSvg(COB_5MM)).toContain('bends sideways');
    expect(stripSvg(COB_5MM)).toContain('strip-notch');
    expect(stripSvg(WS2812B_60)).not.toContain('strip-notch');
  });
});
