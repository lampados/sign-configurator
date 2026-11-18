import { describe, expect, it } from 'vitest';
import {
  CODE_PATTERN,
  DESIGN_MAX_BYTES,
  IMAGE_MAX_BYTES,
  createDesign,
  newCode,
  readDesign,
  readDesignImage,
  type DesignKv,
  type StoredQuote,
} from '../src/api/designStore';
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

describe('designs saved for the shop', () => {
  it('the code is readable: four plus four, without 0, O, 1, I, L', () => {
    for (let seed = 0; seed < 250; seed += 7) expect(newCode(counter(seed))).toMatch(CODE_PATTERN);
  });

  it('saves and reads back: summary and link for the shop, order only with full', async () => {
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

  it('nothing is stored beyond order and summary', async () => {
    const kv = memoryKv();
    const body = { order: ORDER, summary: SUMMARY, email: 'someone@example.test', name: 'Someone' };
    const made = await createDesign(JSON.stringify(body), kv, NOW, counter(9));
    const stored = kv.data.get(`design:${String(made.body.code)}`)!;
    expect(stored).not.toContain('someone@example.test');
    expect(Object.keys(JSON.parse(stored) as object).sort()).toEqual(['code', 'createdAt', 'order', 'summary', 'v']);
  });

  it('rejects what is not a design', async () => {
    const kv = memoryKv();
    const post = (raw: string) => createDesign(raw, kv, NOW, counter(1));
    expect((await post('{')).status).toBe(400);
    expect((await post(JSON.stringify({ order: { schemaVersion: 99 }, summary: [] }))).body.error).toBe('bad_order');
    expect((await post(JSON.stringify({ order: ORDER, summary: [['a', 1]] }))).body.error).toBe('bad_summary');
    expect((await post(JSON.stringify({ order: ORDER, summary: [['a', 'x'.repeat(241)]] }))).body.error).toBe('bad_summary');
    expect((await post(' '.repeat(DESIGN_MAX_BYTES + 1))).status).toBe(413);
    expect(kv.data.size).toBe(0);
  });

  it('malformed or unknown code, store not bound', async () => {
    const kv = memoryKv();
    expect((await readDesign('../etc', kv, 'https://x.test', false)).status).toBe(400);
    expect((await readDesign('ABCD-EFGH', kv, 'https://x.test', false)).status).toBe(404);
    expect((await readDesign('ABCD-EFGH', undefined, 'https://x.test', false)).status).toBe(503);
    expect((await createDesign('{}', undefined, NOW, counter(1))).status).toBe(503);
  });

  it('a code already taken is not overwritten', async () => {
    const kv = memoryKv();
    const first = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY }), kv, NOW, counter(5));
    const before = kv.data.get(`design:${String(first.body.code)}`);
    const again = await createDesign(JSON.stringify({ order: ORDER, summary: [] }), kv, NOW, counter(5));
    expect(again.status).toBe(503);
    expect(kv.data.get(`design:${String(first.body.code)}`)).toBe(before);
  });
});

const QUOTE: StoredQuote = {
  pricingVersion: '2026-11-17',
  complete: true,
  lines: [
    { id: 'controller', label: 'Controller', detail: 'GLEDOPTO ESP32 Ultra Mini (GL-C-309WL)', amount: 35 },
    { id: 'strip', label: 'LED strip', detail: 'WS2812B 144 LED/m IP20 · 0.82 m', amount: 16.49 },
    { id: 'margin', label: 'Margin', detail: '15 %', amount: 33.22 },
  ],
  total: 255,
  shipping: 20,
};
// A fake JPEG: it starts like a real one (FF D8 FF), then any bytes.
const jpeg = (bytes: number): string => `data:image/jpeg;base64,${Buffer.from(Uint8Array.from({ length: bytes }, (_, i) => [0xff, 0xd8, 0xff, 0xe0][i] ?? i % 251)).toString('base64')}`;

describe('estimate and photo for the shop (SPEC §12.7)', () => {
  it('the estimate and the photo are saved and the shop reads them back', async () => {
    const kv = memoryKv();
    const made = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY, quote: QUOTE, image: jpeg(3000) }), kv, NOW, counter(3));
    expect(made.status).toBe(201);
    const code = String(made.body.code);
    expect(kv.ttl.get(`image:${code}`)).toBe(180 * 24 * 60 * 60);

    const shop = await readDesign(code, kv, 'https://example.test', false);
    expect(shop.body.quote).toEqual(QUOTE);
    expect(shop.body.imageUrl).toBe(`https://example.test/api/design/${code}/image`);

    const image = await readDesignImage(code.toLowerCase(), kv);
    expect(image.status).toBe(200);
    expect(image.bytes).toHaveLength(3000);
    expect([...image.bytes!.slice(0, 3)]).toEqual([0xff, 0xd8, 0xff]);
  });

  it('without estimate and photo everything stays as it was', async () => {
    const kv = memoryKv();
    const made = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY }), kv, NOW, counter(3));
    const code = String(made.body.code);
    const shop = await readDesign(code, kv, 'https://example.test', false);
    expect(shop.body.quote).toBeUndefined();
    expect(shop.body.imageUrl).toBeUndefined();
    expect((await readDesignImage(code, kv)).status).toBe(404);
    expect((await readDesignImage('nope', kv)).status).toBe(400);
    expect((await readDesignImage(code, undefined)).status).toBe(503);
  });

  it('a line without a price stays without a price, and the estimate says it is incomplete', async () => {
    const kv = memoryKv();
    const partial: StoredQuote = { ...QUOTE, complete: false, lines: [{ id: 'strip', label: 'LED strip', detail: 'WS2812B 30 LED/m IP20 · 0.80 m', amount: null }] };
    const made = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY, quote: partial }), kv, NOW, counter(3));
    const shop = await readDesign(String(made.body.code), kv, 'https://example.test', false);
    expect(shop.body.quote).toEqual(partial);
  });

  it('a malformed or inflated estimate is not accepted, and nothing is left in the KV', async () => {
    const post = async (quote: unknown) => {
      const kv = memoryKv();
      const result = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY, quote }), kv, NOW, counter(3));
      return { error: result.body.error, saved: kv.data.size };
    };
    for (const bad of [
      null,
      'cheap',
      { ...QUOTE, total: -1 },
      { ...QUOTE, total: 1e9 },
      { ...QUOTE, total: '255' },
      { ...QUOTE, complete: 'yes' },
      { ...QUOTE, pricingVersion: '<script>' },
      { ...QUOTE, lines: [] },
      { ...QUOTE, lines: Array.from({ length: 21 }, () => QUOTE.lines[0]) },
      { ...QUOTE, lines: [{ ...QUOTE.lines[0], id: 'Controller!' }] },
      { ...QUOTE, lines: [{ ...QUOTE.lines[0], amount: 'free' }] },
      { ...QUOTE, lines: [{ ...QUOTE.lines[0], amount: -5 }] },
      { ...QUOTE, lines: [{ ...QUOTE.lines[0], detail: 'x'.repeat(241) }] },
    ]) {
      expect(await post(bad), JSON.stringify(bad).slice(0, 60)).toEqual({ error: 'bad_quote', saved: 0 });
    }
    // Extra fields do not get into the KV.
    const kv = memoryKv();
    const made = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY, quote: { ...QUOTE, email: 'a@example.test' } }), kv, NOW, counter(3));
    expect(kv.data.get(`design:${String(made.body.code)}`)).not.toContain('example.test');
  });

  it('the photo is only a JPEG within the maximum size', async () => {
    const post = async (image: unknown) => {
      const kv = memoryKv();
      const result = await createDesign(JSON.stringify({ order: ORDER, summary: SUMMARY, image }), kv, NOW, counter(3));
      return { status: result.status, error: result.body.error, saved: kv.data.size };
    };
    expect(await post(jpeg(IMAGE_MAX_BYTES))).toEqual({ status: 201, error: undefined, saved: 2 });
    for (const bad of [
      jpeg(IMAGE_MAX_BYTES + 3),
      'data:image/png;base64,iVBORw0KGgo=',
      'data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=',
      'data:image/jpeg;base64,',
      'data:image/jpeg;base64,/9j/not base64!',
      // Declared JPEG, but the bytes say HTML.
      `data:image/jpeg;base64,${Buffer.from('<html><script>alert(1)</script></html>').toString('base64')}`,
      'https://example.test/sign.jpg',
      42,
    ]) {
      expect(await post(bad), String(bad).slice(0, 40)).toEqual({ status: 400, error: 'bad_image', saved: 0 });
    }
  });
});
