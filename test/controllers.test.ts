import { describe, expect, it } from 'vitest';
import { CONTROLLER, CONTROLLERS, DEFAULT_PARAMS, GENERATOR_VERSION, controllerAmps, controllerOf } from '../src/config';
import { bomAssembly } from '../src/export/bom';
import { migrateOrder } from '../src/order/schema';
import { decodeShare, encodeShare } from '../src/order/share';
import { controllerOptions, techParams } from '../src/ui/techParams';

describe('controller', () => {
  it('il GLEDOPTO Ultra Mini resta lo standard; quattro controller, id unici, ognuno con il suo prezzo', () => {
    expect(CONTROLLER.model).toBe('GL-C-309WL');
    expect(DEFAULT_PARAMS.CONTROLLER_ID).toBe(CONTROLLER.id);
    expect(new Set(CONTROLLERS.map((c) => c.id)).size).toBe(CONTROLLERS.length);
    for (const c of CONTROLLERS) {
      expect(c.minV).toBeLessThanOrEqual(5);
      expect(c.maxV).toBeGreaterThanOrEqual(12);
    }
    expect(Object.fromEntries(CONTROLLERS.map((c) => [c.id, c.priceEur]))).toEqual({
      'gl-c-309wl': 35,
      'gl-c-015wl': 44,
      'quinled-dig-uno': 35,
      'xiao-led-driver': 18,
    });
    expect(controllerOf('gl-c-015wl').model).toBe('GL-C-015WL');
    // Tolti dal catalogo: un design che li nomina torna allo standard.
    for (const gone of ['gl-c-618wl', 'quinled-dig-next-2', 'quinled-dig-quad']) expect(controllerOf(gone)).toBe(CONTROLLER);
    expect(controllerOf('boh')).toBe(CONTROLLER);
  });

  it('i limiti degli avvisi seguono il controller scelto', () => {
    // 200 LED a 60 mA, 5 V: 12 A, 15 A con il margine.
    const small = bomAssembly([], [], 200, 60, 5);
    expect(small.supplyA).toBe(15);
    expect(small.controller).toBe('gl-c-309wl');
    expect(small.controllerWarnings.join(' ')).toContain('10 A');
    const uno = bomAssembly([], [], 200, 60, 5, 'quinled-dig-uno');
    expect(uno.controller).toBe('quinled-dig-uno');
    expect(uno.controllerWarnings).toEqual([]);
    // Troppi LED per l'Ultra Mini, non per il Dig-Uno.
    expect(bomAssembly([], [], 1000, 1, 24).controllerWarnings.join(' ')).toContain('800 IC');
    expect(bomAssembly([], [], 1000, 1, 24, 'quinled-dig-uno').controllerWarnings).toEqual([]);
  });

  it('la scheda Seeed XIAO: 3 A a 5 V, 2 A a 12 V, niente 24 V', () => {
    const xiao = controllerOf('xiao-led-driver');
    expect(controllerAmps(xiao, 5)).toBe(3);
    expect(controllerAmps(xiao, 12)).toBe(2);
    expect(controllerAmps(CONTROLLER, 12)).toBe(10);
    // 30 LED a 60 mA, 5 V: 1,8 A, 3 A con il margine. Ci sta.
    expect(bomAssembly([], [], 30, 60, 5, 'xiao-led-driver').controllerWarnings).toEqual([]);
    // 100 LED: 6 A, 8 A con il margine. Troppi per 3 A.
    expect(bomAssembly([], [], 100, 60, 5, 'xiao-led-driver').controllerWarnings.join(' ')).toContain('oltre i 3 A');
    // A 12 V il limite scende a 2 A: 100 LED sono 2,5 A, 4 A con il margine.
    expect(bomAssembly([], [], 100, 60, 12, 'xiao-led-driver').controllerWarnings.join(' ')).toContain('oltre i 2 A');
    // A 24 V non si può usare, qualunque sia il numero di LED.
    const at24 = bomAssembly([], [], 10, 60, 24, 'xiao-led-driver').controllerWarnings;
    expect(at24.join(' ')).toContain('accetta 5–12 V');
    expect(bomAssembly([], [], 10, 60, 24).controllerWarnings).toEqual([]);
  });

  it('va nell\'ordine solo se diverso dallo standard, e passa per il link', () => {
    expect(controllerOptions().filter((o) => o.isDefault).map((o) => o.value)).toEqual([CONTROLLER.id]);
    expect(techParams({ numbers: {}, edgeProfile: 'square', controller: CONTROLLER.id })).toEqual({});
    expect(techParams({ numbers: {}, edgeProfile: 'square', controller: 'nope' })).toEqual({});
    const params = techParams({ numbers: {}, edgeProfile: 'square', controller: 'quinled-dig-uno' });
    expect(params).toEqual({ CONTROLLER_ID: 'quinled-dig-uno' });
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
    expect(read.order?.params).toEqual(params);
    const bad = decodeShare(encodeShare({ ...order, params: { CONTROLLER_ID: 'xyz' } }).hash ?? '');
    expect(bad.order?.params.CONTROLLER_ID).toBeUndefined();
    expect(bad.warnings.join(' ')).toContain('Controller');
  });
});

describe('disegni dei controller', () => {
  it('uno per controller; senza misure del costruttore la sagoma è tratteggiata e lo dice', async () => {
    const { controllerArt } = await import('../src/parts/controllerArt');
    for (const c of CONTROLLERS) {
      const svg = controllerArt(c);
      expect(svg).toContain(`${c.name}, `);
      expect(svg.includes('size not published')).toBe(c.sizeMm === null);
      expect(svg.includes('stroke-dasharray')).toBe(c.sizeMm === null);
    }
  });
});
