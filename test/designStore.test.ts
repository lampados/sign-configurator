import { describe, expect, it } from 'vitest';
import { CODE_PATTERN, DESIGN_MAX_BYTES, createDesign, newCode, readDesign, type DesignKv } from '../src/api/designStore';
import { decodeShare } from '../src/order/share';
import { DEFAULT_CUSTOMER, type SignOrderV4 } from '../src/order/schema';

function memoryKv(): DesignKv & { data: Map<string, string>; ttl: Map<string, number | undefined> } {
  const data = new Map<string, string>();
  const ttl = new Map<string, number | undefined>();
  return {
    data,
    ttl,
    get: async (key) => data.get(key) ?? null,
    put: async (key, value, options) => {
      data.set(key, value);
      ttl.set(key, options?.expirationTtl);
    },
  };
}

const ORDER: SignOrderV4 = {
  schemaVersion: 4,
  generatorVersion: 'test',
  pricingVersion: null,
  source: { kind: 'text', text: 'Ciao', fontId: 'sacramento' },
  heightMm: 120,
  sizePreset: 'M',
  color: '#ff2fd6',
  params: {},
  paths: null,
  crossings: [],
  customer: { ...DEFAULT_CUSTOMER },
  plate: null,
};
const SUMMARY: [string, string][] = [
  ['Text', 'Ciao'],
  ['Assembly', '38 strip cuts · 6 h 20 min'],
];
const counter = (start: number) => (n: number) => Uint8Array.from({ length: n }, (_, i) => start + i);
const NOW = new Date('2026-11-15T20:00:00Z');

describe('design salvati per il negozio', () => {
  it('il codice è leggibile: quattro più quattro, senza 0, O, 1, I, L', () => {
    for (let seed = 0; seed < 250; seed += 7) expect(newCode(counter(seed))).toMatch(CODE_PATTERN);
  });

  it('salva e rilegge: riepilogo e link per il negozio, ordine solo con full', async () => {
    const kv = memoryKv();
    const made = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY }), kv, NOW, counter(3));
    expect(made.status).toBe(201);
    const code = String(made.body.code);
    expect(code).toMatch(CODE_PATTERN);
    expect(kv.ttl.get(`design:${code}`)).toBe(180 * 24 * 60 * 60);

    const shop = await readDesign(code.toLowerCase(), kv, 'https://example.test', false);
    expect(shop.status).toBe(200);
    expect(shop.body.summary).toEqual(SUMMARY);
    expect(shop.body.openUrl).toBe(`https://example.test/?d=${code}`);
    expect(shop.body.order).toBeUndefined();

    const full = await readDesign(code, kv, 'https://example.test', true);
    const reopened = decodeShare(String(full.body.order));
    expect(reopened.order?.source).toEqual(ORDER.source);
    expect(reopened.order?.heightMm).toBe(120);
  });

  it('nel salvataggio non resta niente oltre a ordine e riepilogo', async () => {
    const kv = memoryKv();
    const body = { order: ORDER, summary: SUMMARY, email: 'someone@example.test', name: 'Someone' };
    const made = await createDesign(JSON.stringify(body), kv, NOW, counter(9));
    const stored = kv.data.get(`design:${String(made.body.code)}`)!;
    expect(stored).not.toContain('someone@example.test');
    expect(Object.keys(JSON.parse(stored) as object).sort()).toEqual(['code', 'createdAt', 'order', 'summary', 'v']);
  });

  it('rifiuta quello che non è un design', async () => {
    const kv = memoryKv();
    const post = (raw: string) => createDesign(raw, kv, NOW, counter(1));
    expect((await post('{')).status).toBe(400);
    expect((await post(JSON.stringify({ order: { schemaVersion: 99 }, summary: [] }))).body.error).toBe('bad_order');
    expect((await post(JSON.stringify({ order: ORDER, summary: [['a', 1]] }))).body.error).toBe('bad_summary');
    expect((await post(JSON.stringify({ order: ORDER, summary: [['a', 'x'.repeat(241)]] }))).body.error).toBe('bad_summary');
    expect((await post(' '.repeat(DESIGN_MAX_BYTES + 1))).status).toBe(413);
    expect(kv.data.size).toBe(0);
  });

  it('codice malformato o sconosciuto, archivio non collegato', async () => {
    const kv = memoryKv();
    expect((await readDesign('../etc', kv, 'https://x.test', false)).status).toBe(400);
    expect((await readDesign('ABCD-EFGH', kv, 'https://x.test', false)).status).toBe(404);
    expect((await readDesign('ABCD-EFGH', undefined, 'https://x.test', false)).status).toBe(503);
    expect((await createDesign('{}', undefined, NOW, counter(1))).status).toBe(503);
  });

  it('un codice già occupato non si sovrascrive', async () => {
    const kv = memoryKv();
    const first = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY }), kv, NOW, counter(5));
    const before = kv.data.get(`design:${String(first.body.code)}`);
    const again = await createDesign(JSON.stringify({ order: ORDER, summary: [] }), kv, NOW, counter(5));
    expect(again.status).toBe(503);
    expect(kv.data.get(`design:${String(first.body.code)}`)).toBe(before);
  });
});
