import { describe, expect, it } from 'vitest';
import {
  CHANNEL_CLEARANCE,
  DEFAULT_PARAMS,
  DEFAULT_STRIP,
  LED_AIR,
  minLetterH,
  resolveParams,
  rMin,
  shopCartUrl,
  shopOf,
  supportOf,
  STRIP_PROFILES,
  stripFitWarnings,
  totalHeight,
} from '../src/config';

describe('config', () => {
  it('R_MIN ≈ 14.6 mm with 10 mm hinges at 40°, like the COB', () => {
    const cob = STRIP_PROFILES.find((s) => s.id === 'cob-5mm')!;
    expect(cob.HINGE_MAX_DEG).toBe(40);
    expect(rMin(cob)).toBeCloseTo(14.62, 2);
  });

  it('the default strip does not bend sideways: on a bend it is cut, with no bend limit of its own', () => {
    expect(DEFAULT_STRIP.sideBend).toBe(false);
    // 90° è il limite di due pezzi dritti accostati, non della striscia.
    expect(DEFAULT_PARAMS.HINGE_MAX_DEG).toBe(90);
    expect(rMin(DEFAULT_PARAMS)).toBeCloseTo(DEFAULT_PARAMS.HINGE_PITCH / Math.SQRT2, 6);
  });

  it('total height = FLOOR + CHANNEL_DEPTH', () => {
    expect(totalHeight(DEFAULT_PARAMS)).toBe(DEFAULT_PARAMS.FLOOR + DEFAULT_PARAMS.CHANNEL_DEPTH);
    expect(totalHeight(DEFAULT_PARAMS)).toBe(12);
  });

  it("the wire slot is as wide as the channel and sits in the last millimetres", () => {
    expect(DEFAULT_PARAMS.WIRE_SLOT_W).toBe(DEFAULT_PARAMS.CHANNEL_W);
    expect(DEFAULT_PARAMS.WIRE_SLOT_L).toBe(6);
    expect(DEFAULT_PARAMS.WALL_MIN).toBe(1.2);
    expect(DEFAULT_PARAMS.MIN_GAP).toBe(1);
    expect(DEFAULT_PARAMS.SLOT_LIP_CHAMFER).toBe(1);
  });

  it('the standard strip is the WS2812B 144 LED/m, and MIN_LETTER_H is twice R_MIN', () => {
    expect(DEFAULT_STRIP.id).toBe('ws2812b-144');
    expect(DEFAULT_PARAMS.STRIP_W).toBe(10);
    expect(DEFAULT_PARAMS.STRIP_T).toBe(2);
    expect(DEFAULT_PARAMS.CHANNEL_W).toBe(10.4);
    expect(DEFAULT_PARAMS.LED_PER_M).toBe(144);
    // Fra i LED e il diffusore resta LED_AIR.
    expect(DEFAULT_PARAMS.CHANNEL_DEPTH - DEFAULT_PARAMS.STRIP_T).toBe(LED_AIR);
    expect(DEFAULT_PARAMS.STRIP_W).toBe(DEFAULT_STRIP.STRIP_W);
    expect(DEFAULT_PARAMS.STRIP_T).toBe(DEFAULT_STRIP.STRIP_T);
    expect(DEFAULT_PARAMS.CHANNEL_W).toBe(DEFAULT_STRIP.CHANNEL_W);
    expect(DEFAULT_PARAMS.HINGE_PITCH).toBe(DEFAULT_STRIP.HINGE_PITCH);
    expect(DEFAULT_PARAMS.HINGE_MAX_DEG).toBe(DEFAULT_STRIP.HINGE_MAX_DEG);
    expect(DEFAULT_PARAMS.CUT_PITCH).toBe(DEFAULT_STRIP.CUT_PITCH);
    expect(DEFAULT_PARAMS.LED_PER_M).toBe(DEFAULT_STRIP.LED_PER_M);
    expect(DEFAULT_PARAMS.MIN_LETTER_H).toBeCloseTo(minLetterH(DEFAULT_STRIP));
    expect(DEFAULT_PARAMS.MIN_LETTER_H).toBeCloseTo(2 * rMin(DEFAULT_STRIP));
    const wider = resolveParams({ HINGE_PITCH: 20 });
    expect(wider.MIN_LETTER_H).toBeCloseTo(2 * rMin(wider));
    expect(wider.HINGE_PITCH).toBe(20);
    // Una cerniera per LED: 1000 / 144.
    expect(DEFAULT_PARAMS.HINGE_PITCH).toBeCloseTo(6.94, 2);
    expect(DEFAULT_PARAMS.CUT_PITCH).toBe(DEFAULT_PARAMS.HINGE_PITCH);
  });

  it('overrides do not touch the defaults', () => {
    const p = resolveParams({ WALL: 3 });
    expect(p.WALL).toBe(3);
    expect(p.FLOOR).toBe(DEFAULT_PARAMS.FLOOR);
    expect(DEFAULT_PARAMS.WALL).toBe(2.2);
  });
});

describe('strip and channel', () => {
  it('every profile has a channel as wide as the strip plus the tolerance', () => {
    for (const profile of STRIP_PROFILES) {
      expect(profile.CHANNEL_W, profile.id).toBeCloseTo(profile.STRIP_W + CHANNEL_CLEARANCE, 9);
    }
  });

  it('the default depth is the strip thickness plus the air above the LEDs', () => {
    expect(DEFAULT_PARAMS.CHANNEL_DEPTH).toBeCloseTo(DEFAULT_PARAMS.STRIP_T + LED_AIR, 9);
  });

  it('a channel that does not hold the strip warns', () => {
    expect(stripFitWarnings(DEFAULT_PARAMS)).toEqual([]);
    const narrow = stripFitWarnings({ ...DEFAULT_PARAMS, CHANNEL_W: 6 });
    expect(narrow).toHaveLength(1);
    expect(narrow[0]).toMatch(/Channel 6 mm wide: the 10 mm strip does not fit/);
    const shallow = stripFitWarnings({ ...DEFAULT_PARAMS, CHANNEL_DEPTH: 1 });
    expect(shallow).toHaveLength(1);
    expect(shallow[0]).toMatch(/Channel 1 mm deep: the strip is 2 mm thick/);
    // Il canale esattamente largo quanto la striscia passa: la tolleranza è un consiglio, non un obbligo.
    expect(stripFitWarnings({ ...DEFAULT_PARAMS, CHANNEL_W: DEFAULT_PARAMS.STRIP_W })).toEqual([]);
  });
});

describe('narrow strips', () => {
  it('the channel follows the width, the pitch stays that of the density', async () => {
    const { STRIP_PROFILES, CHANNEL_CLEARANCE } = await import('../src/config');
    const byId = (id: string) => STRIP_PROFILES.find((strip) => strip.id === id)!;
    for (const [id, width, pitch] of [
      ['ws2812b-60-8mm', 8, 16.67],
      ['ws2812b-60-5mm', 5, 16.67],
      ['ws2812b-60-4mm', 4, 16.67],
      ['ws2812b-144-5mm', 5, 6.94],
    ] as const) {
      const strip = byId(id);
      expect(strip.STRIP_W).toBe(width);
      expect(strip.CHANNEL_W).toBeCloseTo(width + CHANNEL_CLEARANCE, 6);
      expect(strip.CUT_PITCH).toBe(pitch);
      expect(strip.sideBend).toBe(false);
      expect(strip.measured).toBe(false);
    }
    expect(new Set(STRIP_PROFILES.map((strip) => strip.id)).size).toBe(STRIP_PROFILES.length);
    // I profili di prima non cambiano nome né codice: gli ordini salvati restano validi.
    expect(byId('ws2812b-60').name).toBe('WS2812B 60 LED/m IP20');
    expect(byId('ws2812b-60-ip65').STRIP_W).toBe(10);
  });
});

describe('bending without a cut', () => {
  it('30° for unsleeved WS2812B at every density, 10° for IP65', async () => {
    const { STRIP_PROFILES } = await import('../src/config');
    const deg = (id: string) => STRIP_PROFILES.find((strip) => strip.id === id)!.cutBendDeg;
    for (const id of ['ws2812b-60', 'ws2812b-30', 'ws2812b-60-8mm', 'ws2812b-60-5mm', 'ws2812b-60-4mm', 'ws2812b-144', 'ws2812b-144-5mm']) expect(deg(id), id).toBe(30);
    for (const id of ['ws2812b-60-ip65']) expect(deg(id), id).toBe(10);
  });

  it('the shop comes from build variables; without them, no cart', () => {
    expect(shopOf('https://shop.example.test/', '1637')).toEqual({ url: 'https://shop.example.test', productId: 1637 });
    expect(shopOf(' https://example.test/negozio/ ', ' 12 ')).toEqual({ url: 'https://example.test/negozio', productId: 12 });
    for (const [url, id] of [
      [undefined, undefined],
      ['', '1637'],
      ['https://shop.example.test', undefined],
      ['https://shop.example.test', '0'],
      ['https://shop.example.test', '1.5'],
      ['https://shop.example.test', 'abc'],
      ['shop.example.test', '1637'],
      ['javascript:alert(1)', '1637'],
    ] as const) {
      expect(shopOf(url, id)).toBeNull();
    }
    const shop = shopOf('https://shop.example.test', '1637');
    expect(shopCartUrl('K7F3-92QD', shop)).toBe('https://shop.example.test/?add-to-cart=1637&design=K7F3-92QD');
    expect(shopCartUrl('a b', shop)).toBe('https://shop.example.test/?add-to-cart=1637&design=a%20b');
    expect(shopCartUrl('K7F3-92QD', null)).toBeNull();
  });

  it('the donation page comes from a build variable; without it, no invitation', () => {
    expect(supportOf('https://ko-fi.com/vongomben')).toBe('https://ko-fi.com/vongomben');
    expect(supportOf(' https://ko-fi.com/vongomben ')).toBe('https://ko-fi.com/vongomben');
    for (const url of [undefined, '', 'ko-fi.com/vongomben', 'javascript:alert(1)', 'mailto:a@example.test']) {
      expect(supportOf(url), String(url)).toBeNull();
    }
  });
});
