// Designs saved for the shop (Request): the configurator saves the design and receives a code, the
// shop reads it back server to server, with the price estimate and a photo of the sign. No personal data ever passes here: name, email and address
// are entered only in the shop. Pure module: used by the Pages Functions and the tests.

import { decodeShare, encodeShare } from '../order/share';

/** What is needed of a Cloudflare KV: this way the tests use a map. */
export interface DesignKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** A summary row, as the customer sees it: label and value. */
export type SummaryRow = [label: string, value: string];

/** A line of the estimate: what it is (`detail`: model, metres, minutes) and what it costs. */
export interface QuoteLine {
  /** Id of the `priceOrder` line: `controller`, `strip`, `print`… */
  id: string;
  label: string;
  detail: string;
  /** €, excluding VAT. `null`: line without a price (a strip not yet in the price list). */
  amount: number | null;
}

/**
 * Bill of materials with prices, as in the Order panel (SPEC §12.5). Computed by the customer's browser:
 * it is an **estimate**, the shop shows it as such and does not use it to charge.
 */
export interface StoredQuote {
  pricingVersion: string;
  /** `false`: at least one line has no price and the total does not include it. */
  complete: boolean;
  lines: QuoteLine[];
  /** €, excluding VAT, excluding shipping. */
  total: number;
  /** Estimated shipping, €, outside the total. */
  shipping: number;
}

export interface StoredDesign {
  v: 1;
  code: string;
  createdAt: string;
  /** Normalized order (`encodeShare` JSON): reopens the design in the configurator. */
  order: string;
  summary: SummaryRow[];
  /** Absent in designs saved before 17 November 2026, or without a shop. */
  quote?: StoredQuote;
  /** There is a photo of the sign, saved separately under the key `image:<code>`. */
  image?: boolean;
}

export interface DesignResult {
  status: number;
  body: Record<string, unknown>;
}

/** Without 0/O, 1/I/L: the code can be read and dictated without mistakes. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
export const DESIGN_MAX_BYTES = 1_500_000;
export const SUMMARY_MAX_ROWS = 60;
export const SUMMARY_MAX_CHARS = 240;
export const QUOTE_MAX_LINES = 20;
export const QUOTE_MAX_EUR = 100_000;
/** The photo is a JPEG of about 1000 px: 400 kB is more than enough. */
export const IMAGE_MAX_BYTES = 400_000;
const IMAGE_PREFIX = 'data:image/jpeg;base64,';
/** A design stays 180 days: the time of a negotiation, not an archive. */
export const DESIGN_TTL_SECONDS = 180 * 24 * 60 * 60;

export function newCode(random: (n: number) => Uint8Array): string {
  const bytes = random(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) {
    out += CODE_ALPHABET[bytes[i]! % CODE_ALPHABET.length];
    if (i === 3) out += '-';
  }
  return out;
}

function summaryOf(input: unknown): SummaryRow[] | null {
  if (!Array.isArray(input) || input.length > SUMMARY_MAX_ROWS) return null;
  const rows: SummaryRow[] = [];
  for (const row of input) {
    if (!Array.isArray(row) || row.length !== 2) return null;
    const [label, value] = row as unknown[];
    if (typeof label !== 'string' || typeof value !== 'string') return null;
    if (label.length === 0 || label.length > SUMMARY_MAX_CHARS || value.length > SUMMARY_MAX_CHARS) return null;
    rows.push([label, value]);
  }
  return rows;
}

const euro = (value: unknown): number | null =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= QUOTE_MAX_EUR ? Math.round(value * 100) / 100 : null;

const shortText = (value: unknown, max: number): string | null => (typeof value === 'string' && value.length <= max ? value : null);

/** The estimate, copied field by field: what is not expected does not enter the KV. */
function quoteOf(input: unknown): StoredQuote | null {
  if (typeof input !== 'object' || input === null) return null;
  const { pricingVersion, complete, lines, total, shipping } = input as Record<string, unknown>;
  const version = shortText(pricingVersion, 20);
  const sum = euro(total);
  const ship = euro(shipping);
  if (!version || !/^[\w.-]+$/.test(version) || typeof complete !== 'boolean' || sum === null || ship === null) return null;
  if (!Array.isArray(lines) || lines.length === 0 || lines.length > QUOTE_MAX_LINES) return null;
  const out: QuoteLine[] = [];
  for (const line of lines) {
    if (typeof line !== 'object' || line === null) return null;
    const { id, label, detail, amount } = line as Record<string, unknown>;
    const lineId = shortText(id, 20);
    const lineLabel = shortText(label, 60);
    const lineDetail = shortText(detail, SUMMARY_MAX_CHARS);
    const lineAmount = amount === null ? null : euro(amount);
    if (!lineId || !/^[a-z]+$/.test(lineId) || !lineLabel || lineDetail === null) return null;
    if (amount !== null && lineAmount === null) return null;
    out.push({ id: lineId, label: lineLabel, detail: lineDetail, amount: lineAmount });
  }
  return { pricingVersion: version, complete, lines: out, total: sum, shipping: ship };
}

/**
 * The photo arrives as a JPEG data URL. Only the base64 is kept, after checking that it really
 * is base64, that it does not exceed the maximum size and that it starts like a JPEG (FF D8 FF).
 */
function imageOf(input: unknown): string | null {
  if (typeof input !== 'string' || !input.startsWith(IMAGE_PREFIX)) return null;
  const base64 = input.slice(IMAGE_PREFIX.length);
  if (base64.length === 0 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if ((base64.length / 4) * 3 - padding > IMAGE_MAX_BYTES) return null;
  // "/9j/" is FF D8 FF in base64: the start of every JPEG.
  return base64.startsWith('/9j/') ? base64 : null;
}

/** The bytes of a saved photo. */
export function imageBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** POST: `{ order, summary, quote?, image? }` → `{ code }`. The order goes through the same check as shared links. */
export async function createDesign(
  raw: string,
  kv: DesignKv | undefined,
  now: Date,
  random: (n: number) => Uint8Array,
): Promise<DesignResult> {
  if (!kv) return { status: 503, body: { error: 'storage_not_configured' } };
  if (new TextEncoder().encode(raw).length > DESIGN_MAX_BYTES) return { status: 413, body: { error: 'too_large' } };
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    return { status: 400, body: { error: 'bad_json' } };
  }
  if (typeof parsed !== 'object' || parsed === null) return { status: 400, body: { error: 'bad_json' } };
  const { order, summary, quote: rawQuote, image: rawImage } = parsed as { order?: unknown; summary?: unknown; quote?: unknown; image?: unknown };
  const read = decodeShare(JSON.stringify(order ?? null));
  if (!read.order) return { status: 400, body: { error: 'bad_order' } };
  const rows = summaryOf(summary);
  if (!rows) return { status: 400, body: { error: 'bad_summary' } };
  // Estimate and photo are optional, but if present they must be right: no half saves.
  const quote = rawQuote === undefined ? null : quoteOf(rawQuote);
  if (rawQuote !== undefined && !quote) return { status: 400, body: { error: 'bad_quote' } };
  const image = rawImage === undefined ? null : imageOf(rawImage);
  if (rawImage !== undefined && !image) return { status: 400, body: { error: 'bad_image' } };

  // Eight symbols out of 31: a collision is very rare, but a taken code is not overwritten.
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = newCode(random);
    if ((await kv.get(`design:${code}`)) !== null) continue;
    const stored: StoredDesign = {
      v: 1,
      code,
      createdAt: now.toISOString(),
      order: encodeShare(read.order).json,
      summary: rows,
      ...(quote ? { quote } : {}),
      ...(image ? { image: true } : {}),
    };
    // The photo first: if the design is there, so is the photo.
    if (image) await kv.put(`image:${code}`, image, { expirationTtl: DESIGN_TTL_SECONDS });
    await kv.put(`design:${code}`, JSON.stringify(stored), { expirationTtl: DESIGN_TTL_SECONDS });
    return { status: 201, body: { code } };
  }
  return { status: 503, body: { error: 'try_again' } };
}

/**
 * GET: the summary for the shop, with the link that reopens the design. With `full` the order too,
 * which the configurator needs to reopen it.
 */
export async function readDesign(
  code: string,
  kv: DesignKv | undefined,
  origin: string,
  full: boolean,
): Promise<DesignResult> {
  if (!kv) return { status: 503, body: { error: 'storage_not_configured' } };
  const clean = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(clean)) return { status: 400, body: { error: 'bad_code' } };
  const raw = await kv.get(`design:${clean}`);
  if (raw === null) return { status: 404, body: { error: 'not_found' } };
  let stored: StoredDesign;
  try {
    stored = JSON.parse(raw) as StoredDesign;
  } catch {
    return { status: 404, body: { error: 'not_found' } };
  }
  const body: Record<string, unknown> = {
    code: stored.code,
    createdAt: stored.createdAt,
    summary: stored.summary,
    openUrl: `${origin}/?d=${stored.code}`,
  };
  if (stored.quote) body.quote = stored.quote;
  if (stored.image) body.imageUrl = `${origin}/api/design/${stored.code}/image`;
  if (full) body.order = stored.order;
  return { status: 200, body };
}

/** GET of the photo: the bytes of the JPEG, or null if the code is wrong or there is no photo. */
export async function readDesignImage(code: string, kv: DesignKv | undefined): Promise<{ status: number; bytes: Uint8Array<ArrayBuffer> | null }> {
  if (!kv) return { status: 503, bytes: null };
  const clean = code.trim().toUpperCase();
  if (!CODE_PATTERN.test(clean)) return { status: 400, bytes: null };
  const base64 = await kv.get(`image:${clean}`);
  if (base64 === null || !base64.startsWith('/9j/')) return { status: 404, bytes: null };
  try {
    return { status: 200, bytes: imageBytes(base64) };
  } catch {
    return { status: 404, bytes: null };
  }
}
