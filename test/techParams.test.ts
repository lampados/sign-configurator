import { describe, expect, it } from 'vitest';
import { DEFAULT_PARAMS, GENERATOR_VERSION, resolveParams, STRIP_PROFILES } from '../src/config';
import { migrateOrder } from '../src/order/schema';
import { decodeShare, encodeShare } from '../src/order/share';
import { DEFAULT_LED_DENSITY, LED_DENSITIES, TECH_FIELDS, ledDensityOptions, stripOptions, techFieldInvalid, techParams } from '../src/ui/techParams';
import { lightPointsFromChains } from '../src/geometry/lights';
import type { Point } from '../src/geometry/rasterize';

describe('parametri tecnici della pagina cliente', () => {
  it('i valori predefiniti non scrivono override', () => {
    const numbers = Object.fromEntries(TECH_FIELDS.map((f) => [f.key, String(DEFAULT_PARAMS[f.key])]));
    expect(techParams({ numbers, edgeProfile: DEFAULT_PARAMS.EDGE_PROFILE })).toEqual({});
  });

  it('scrive solo i valori cambiati e validi', () => {
    const params = techParams({
      numbers: { STRIP_T: '1.6', CHANNEL_DEPTH: '10', CHANNEL_W: 'abc', FLOOR: '999', WIRE_SLOT_L: '' },
      edgeProfile: 'outer',
    });
    expect(params).toEqual({ STRIP_T: 1.6, CHANNEL_DEPTH: 10, EDGE_PROFILE: 'outer' });
  });

  it('un profilo sconosciuto resta al default', () => {
    expect(techParams({ numbers: {}, edgeProfile: 'tondo' })).toEqual({});
  });

  it('segna come non valido solo ciò che è fuori limite o non numerico', () => {
    const field = TECH_FIELDS.find((f) => f.key === 'CHAMFER_ANGLE')!;
    expect(techFieldInvalid(field, '45')).toBe(false);
    expect(techFieldInvalid(field, '')).toBe(false);
    expect(techFieldInvalid(field, '90')).toBe(true);
    expect(techFieldInvalid(field, 'x')).toBe(true);
  });

  it('ogni parametro tecnico sopravvive al link condiviso', () => {
    const numbers = Object.fromEntries(
      // Un passo sopra il default, o sotto se il default è già il massimo.
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

  it('densità dei LED: solo la scala 30–144, predefinita quella della striscia', () => {
    expect(LED_DENSITIES).toEqual([30, 60, 74, 96, 144]);
    const options = ledDensityOptions();
    expect(options.map((o) => o.value)).toEqual([30, 60, 74, 96, 144]);
    expect(options.filter((o) => o.isDefault).map((o) => o.value)).toEqual([DEFAULT_LED_DENSITY]);
    // La densità predefinita è quella della striscia predefinita.
    expect(DEFAULT_LED_DENSITY).toBe(DEFAULT_PARAMS.LED_PER_M);
    expect(DEFAULT_LED_DENSITY).toBe(60);
    expect(techParams({ numbers: {}, edgeProfile: 'square', ledPerM: '144' })).toEqual({ LED_PER_M: 144 });
    // 60 è la densità della striscia predefinita: uguale al default, non va nell'ordine.
    expect(techParams({ numbers: {}, edgeProfile: 'square', ledPerM: '60' })).toEqual({});
    // Un valore fuori scala torna alla predefinita.
    expect(techParams({ numbers: {}, edgeProfile: 'square', ledPerM: '160' })).toEqual({});
    expect(techParams({ numbers: {}, edgeProfile: 'square' })).toEqual({});
  });

  it('la densità cambia il numero dei LED sulla stessa linea', () => {
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

describe('modello di striscia', () => {
  it('il menu elenca tutti i profili e segna quello predefinito', () => {
    const options = stripOptions();
    expect(options.map((o) => o.value)).toEqual(STRIP_PROFILES.map((s) => s.id));
    expect(options.filter((o) => o.isDefault).map((o) => o.value)).toEqual([DEFAULT_PARAMS.STRIP_ID]);
    // Le strisce che non seguono le curve lo dicono già nell'etichetta.
    expect(options[0]!.value).toBe(DEFAULT_PARAMS.STRIP_ID);
    const plain = options.find((o) => o.value === 'ws2812b-60')!;
    expect(plain.label).toMatch(/cut over 30°/);
    expect(options.find((o) => o.value === 'cob-5mm')!.label).not.toMatch(/cut over/);
  });

  it("l'id della striscia finisce nell'ordine solo se diversa dalla predefinita", () => {
    expect(techParams({ numbers: {}, edgeProfile: 'square', strip: 'cob-5mm' })).toEqual({ STRIP_ID: 'cob-5mm' });
    expect(techParams({ numbers: {}, edgeProfile: 'square', strip: DEFAULT_PARAMS.STRIP_ID })).toEqual({});
    expect(techParams({ numbers: {}, edgeProfile: 'square', strip: 'inventata' })).toEqual({});
  });

  it('il modello detta le misure, ma un valore scritto a mano vince', () => {
    const p = resolveParams({ STRIP_ID: 'ws2812b-60' });
    expect(p.STRIP_W).toBe(10);
    expect(p.STRIP_T).toBe(2);
    expect(p.CHANNEL_W).toBe(10.4);
    expect(p.CHANNEL_DEPTH).toBe(8);
    expect(p.LED_PER_M).toBe(60);
    // In curva si taglia: il limite è quello di due pezzi accostati, non della striscia.
    expect(p.HINGE_MAX_DEG).toBe(90);
    expect(p.MIN_LETTER_H).toBeLessThan(30);
    expect(resolveParams({ STRIP_ID: 'ws2812b-60', CHANNEL_W: 12 }).CHANNEL_W).toBe(12);
    // Una striscia sconosciuta torna alla predefinita invece di lasciare misure a caso.
    expect(resolveParams({ STRIP_ID: 'inventata' }).STRIP_W).toBe(DEFAULT_PARAMS.STRIP_W);
  });

  it('la striscia sopravvive al link, una inventata avvisa', () => {
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
    expect(bad.warnings.join(' ')).toMatch(/Striscia sconosciuta/);
    expect(bad.order?.params.STRIP_ID).toBeUndefined();
  });
});
