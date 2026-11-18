import { describe, expect, it } from 'vitest';
import { CONTROLLER, CONTROLLERS, DEFAULT_PARAMS, GENERATOR_VERSION, controllerAmps, controllerOf } from '../src/config';
import { bomAssembly } from '../src/export/bom';
import { migrateOrder } from '../src/order/schema';
import { decodeShare, encodeShare } from '../src/order/share';
import { controllerOptions, techParams } from '../src/ui/techParams';

describe('controllers', () => {
  it('the GLEDOPTO Ultra Mini stays the standard; four controllers, unique ids, each with its price', () => {
    expect(CONTROLLER.model).toBe('GL-C-309WL');
    expect(DEFAULT_PARAMS.CONTROLLER_ID).toBe(CONTROLLER.id);
    expect(new Set(CONTROLLERS.map((c) => c.id)).size).toBe(CONTROLLERS.length);
    for (const c of CONTROLLERS) {
      expect(c.minV).toBeLessThanOrEqual(5);
      expect(c.maxV).toBeGreaterThanOrEqual(12);
    }
    expect(Object.fromEntries(CONTROLLERS.map((c) => [c.id, c.priceEur]))).toEqual({
      'gl-c-309wl': 35,
      'gl-c-616wl': 40,
      'quinled-dig-uno': 35,
      'xiao-led-driver': 18,
    });
    expect(controllerOf('gl-c-616wl').model).toBe('GL-C-616WL');
    // Removed from the catalogue: a design that names them falls back to the standard.
    for (const gone of ['gl-c-618wl', 'gl-c-015wl', 'quinled-dig-next-2', 'quinled-dig-quad']) expect(controllerOf(gone)).toBe(CONTROLLER);
    expect(controllerOf('boh')).toBe(CONTROLLER);
  });

  it('the warning limits follow the chosen controller', () => {
    // 200 LEDs at 60 mA, 5 V: 12 A, 15 A with the margin.
    const small = bomAssembly([], [], 200, 60, 5);
    expect(small.supplyA).toBe(15);
    expect(small.controller).toBe('gl-c-309wl');
    expect(small.controllerWarnings.join(' ')).toContain('10 A');
    const uno = bomAssembly([], [], 200, 60, 5, 'quinled-dig-uno');
    expect(uno.controller).toBe('quinled-dig-uno');
    expect(uno.controllerWarnings).toEqual([]);
    // Too many LEDs for the Ultra Mini, not for the Dig-Uno.
    expect(bomAssembly([], [], 1000, 1, 24).controllerWarnings.join(' ')).toContain('800 IC');
    expect(bomAssembly([], [], 1000, 1, 24, 'quinled-dig-uno').controllerWarnings).toEqual([]);
  });

  it('the Seeed XIAO board: 3 A at 5 V, 2 A at 12 V, no 24 V', () => {
    const xiao = controllerOf('xiao-led-driver');
    expect(controllerAmps(xiao, 5)).toBe(3);
    expect(controllerAmps(xiao, 12)).toBe(2);
    expect(controllerAmps(CONTROLLER, 12)).toBe(10);
    // 30 LEDs at 60 mA, 5 V: 1.8 A, 3 A with the margin. It fits.
    expect(bomAssembly([], [], 30, 60, 5, 'xiao-led-driver').controllerWarnings).toEqual([]);
    // 100 LEDs: 6 A, 8 A with the margin. Too many for 3 A.
    expect(bomAssembly([], [], 100, 60, 5, 'xiao-led-driver').controllerWarnings.join(' ')).toContain('over the 3 A');
    // At 12 V the limit drops to 2 A: 100 LEDs are 2.5 A, 4 A with the margin.
    expect(bomAssembly([], [], 100, 60, 12, 'xiao-led-driver').controllerWarnings.join(' ')).toContain('over the 2 A');
    // At 24 V it cannot be used, whatever the number of LEDs.
    const at24 = bomAssembly([], [], 10, 60, 24, 'xiao-led-driver').controllerWarnings;
    expect(at24.join(' ')).toContain('takes 5–12 V');
    expect(bomAssembly([], [], 10, 60, 24).controllerWarnings).toEqual([]);
  });

  it('it goes into the order only if different from the standard, and survives the link', () => {
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
    expect(bad.warnings.join(' ')).toContain('controller');
  });
});

describe('controller drawings', () => {
  it('one per controller; without the maker\'s measurements the outline is dashed and says so', async () => {
    const { controllerArt } = await import('../src/parts/controllerArt');
    for (const c of CONTROLLERS) {
      const svg = controllerArt(c);
      expect(svg).toContain(`${c.name}, `);
      expect(svg.includes('size not published')).toBe(c.sizeMm === null);
      expect(svg.includes('stroke-dasharray')).toBe(c.sizeMm === null);
    }
  });
});
