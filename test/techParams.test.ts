import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, GENERATOR_VERSION, resolveParams, STRIP_PROFILES } from '../src/config';
import { migrateOrder } from '../src/order/schema';
import { decodeShare, encodeShare } from '../src/order/share';
import { DEFAULT_LED_DENSITY, LED_DENSITIES, TECH_FIELDS, TECH_FOCUS, slotFieldsShown, ledDensityOptions, stripOptions, techFieldInvalid, techParams } from '../src/ui/techParams';
import { lightPointsFromChains } from '../src/geometry/lights';
import type { Point } from '../src/geometry/rasterize';

describe('technical parameters of the customer page', () => {
  it('default values write no overrides', () => {
    const numbers = Object.fromEntries(TECH_FIELDS.map((f) => [f.key, String(DEFAULT_PARAMS[f.key])]));
    expect(techParams({ numbers, edgeProfile: DEFAULT_PARAMS.EDGE_PROFILE })).toEqual({});
  });

  it('channel fields point at their own element, the LED strip group at nothing', () => {
    expect(TECH_FOCUS.CHANNEL_W).toBe('channelWidth');
    expect(TECH_FOCUS.CHANNEL_DEPTH).toBe('channelDepth');
    expect(TECH_FOCUS.FLOOR).toBe('floor');
    for (const key of ['STRIP_W', 'STRIP_T', 'HINGE_PITCH', 'HINGE_MAX_DEG'] as const) expect(TECH_FOCUS[key], key).toBeUndefined();
  });

  it('the slot fields show only without a round end hole', () => {
    expect(slotFieldsShown('8')).toBe(false);
    expect(slotFieldsShown('0')).toBe(true);
    expect(slotFieldsShown('')).toBe(true);
  });

  it('writes only changed and valid values', () => {
    const params = techParams({
      numbers: { STRIP_T: '1.6', CHANNEL_DEPTH: '10', CHANNEL_W: 'abc', FLOOR: '999', WIRE_SLOT_L: '' },
      edgeProfile: 'outer',
    });
    expect(params).toEqual({ STRIP_T: 1.6, CHANNEL_DEPTH: 10, EDGE_PROFILE: 'outer' });
  });

  it('an unknown profile stays at the default', () => {
    expect(techParams({ numbers: {}, edgeProfile: 'tondo' })).toEqual({});
  });

  it('marks as invalid only what is out of range or not a number', () => {
    const field = TECH_FIELDS.find((f) => f.key === 'CHAMFER_ANGLE')!;
    expect(techFieldInvalid(field, '45')).toBe(false);
    expect(techFieldInvalid(field, '')).toBe(false);
    expect(techFieldInvalid(field, '90')).toBe(true);
    expect(techFieldInvalid(field, 'x')).toBe(true);
  });

  it('every technical parameter survives the shared link', () => {
    const numbers = Object.fromEntries(
      // One step above the default, or below if the default is already the maximum.
      TECH_FIELDS.map((f) => [f.key, String(DEFAULT_PARAMS[f.key] + f.step <= f.max ? DEFAULT_PARAMS[f.key] + f.step : DEFAULT_PARAMS[f.key] - f.step)]),
    );
    const params = { WALL: 2.2, ...techParams({ numbers, edgeProfile: 'both' }) };
    expect(Object.keys(params).length).toBe(TECH_FIELDS.length + 2);
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
    const read = decodeShare(encodeShare(order).hash ?? '');
    expect(read.warnings).toEqual([]);
    expect(read.order?.params).toEqual(params);
  });

  it('LED density: only the 30–144 scale, defaulting to that of the strip', () => {
    expect(LED_DENSITIES).toEqual([30, 60, 74, 96, 144]);
    const options = ledDensityOptions();
    expect(options.map((o) => o.value)).toEqual([30, 60, 74, 96, 144]);
    expect(options.filter((o) => o.isDefault).map((o) => o.value)).toEqual([DEFAULT_LED_DENSITY]);
    // The default density is that of the default strip.
    expect(DEFAULT_LED_DENSITY).toBe(DEFAULT_PARAMS.LED_PER_M);
    expect(DEFAULT_LED_DENSITY).toBe(144);
    expect(techParams({ numbers: {}, edgeProfile: 'square', ledPerM: '60' })).toEqual({ LED_PER_M: 60 });
    // 144 is the density of the default strip: equal to the default, it does not go into the order.
    expect(techParams({ numbers: {}, edgeProfile: 'square', ledPerM: '144' })).toEqual({});
    // An out-of-scale value falls back to the default.
    expect(techParams({ numbers: {}, edgeProfile: 'square', ledPerM: '160' })).toEqual({});
    expect(techParams({ numbers: {}, edgeProfile: 'square' })).toEqual({});
  });

  it('the density changes the number of LEDs on the same line', () => {
    const line: Point[] = [
      [0, 0],
      [1000 + 2 * DEFAULT_PARAMS.WIRE_SLOT_L, 0],
    ];
    for (const density of LED_DENSITIES) {
      const lights = lightPointsFromChains([{ id: 1, points: line, closed: false }], { ...DEFAULT_PARAMS, LED_PER_M: density });
      expect(lights).toHaveLength(density);
    }
  });
});

describe('strip model', () => {
  it('the menu lists every profile and marks the default', () => {
    const options = stripOptions();
    expect(options.map((o) => o.value)).toEqual(STRIP_PROFILES.map((s) => s.id));
    expect(options.filter((o) => o.isDefault).map((o) => o.value)).toEqual([DEFAULT_PARAMS.STRIP_ID]);
    // Strips that do not follow curves already say so in the label.
    expect(options[0]!.value).toBe(DEFAULT_PARAMS.STRIP_ID);
    const plain = options.find((o) => o.value === 'ws2812b-60')!;
    expect(plain.label).toMatch(/cut over 30°/);
    expect(options.find((o) => o.value === 'cob-5mm')!.label).not.toMatch(/cut over/);
  });

  it("the strip id ends up in the order only if it differs from the default", () => {
    expect(techParams({ numbers: {}, edgeProfile: 'square', strip: 'cob-5mm' })).toEqual({ STRIP_ID: 'cob-5mm' });
    expect(techParams({ numbers: {}, edgeProfile: 'square', strip: DEFAULT_PARAMS.STRIP_ID })).toEqual({});
    expect(techParams({ numbers: {}, edgeProfile: 'square', strip: 'inventata' })).toEqual({});
  });

  it('the model sets the measurements, but a hand-typed value wins', () => {
    const p = resolveParams({ STRIP_ID: 'ws2812b-60' });
    expect(p.STRIP_W).toBe(10);
    expect(p.STRIP_T).toBe(2);
    expect(p.CHANNEL_W).toBe(10.4);
    expect(p.CHANNEL_DEPTH).toBe(8);
    expect(p.LED_PER_M).toBe(60);
    // On a bend it is cut: the limit is that of two pieces side by side, not of the strip.
    expect(p.HINGE_MAX_DEG).toBe(90);
    expect(p.MIN_LETTER_H).toBeLessThan(30);
    expect(resolveParams({ STRIP_ID: 'ws2812b-60', CHANNEL_W: 12 }).CHANNEL_W).toBe(12);
    // An unknown strip falls back to the default instead of leaving random measurements.
    expect(resolveParams({ STRIP_ID: 'inventata' }).STRIP_W).toBe(DEFAULT_PARAMS.STRIP_W);
  });

  it('the strip survives the link, a made-up one warns', () => {
    const shared = (params: Record<string, unknown>) =>
      decodeShare(
        encodeShare(
          migrateOrder({
            schemaVersion: 2,
            generatorVersion: GENERATOR_VERSION,
            source: { kind: 'text', text: 'Ciao', fontId: 'sacramento' },
            heightMm: 120,
            color: '#ff2fd6',
            params,
            paths: null,
            crossings: [],
          }),
        ).hash ?? '',
      );
    const ok = shared({ STRIP_ID: 'ws2812b-144' });
    expect(ok.warnings).toEqual([]);
    expect(ok.order?.params.STRIP_ID).toBe('ws2812b-144');
    const bad = shared({ STRIP_ID: 'inventata' });
    expect(bad.warnings.join(' ')).toMatch(/Unknown strip/);
    expect(bad.order?.params.STRIP_ID).toBeUndefined();
  });
});
