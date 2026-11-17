// Design salvati per il negozio (Richiedi): il configuratore salva il design e riceve un codice, il
// negozio lo rilegge da server a server, con la stima dei prezzi e una foto dell'insegna. Qui non passa mai un dato personale: nome, email e indirizzo
// si inseriscono solo nel negozio. Modulo puro: lo usano le Pages Functions e i test.

import { decodeShare, encodeShare } from '../order/share';

/** Quello che serve di un KV di Cloudflare: così i test usano una mappa. */
export interface DesignKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Riga del riepilogo, come la vede il cliente: etichetta e valore. */
export type SummaryRow = [label: string, value: string];

/** Una voce della stima: che cosa è (`detail`: modello, metri, minuti) e quanto costa. */
export interface QuoteLine {
  /** Id della voce di `priceOrder`: `controller`, `strip`, `print`… */
  id: string;
  label: string;
  detail: string;
  /** €, IVA esclusa. `null`: voce senza prezzo (una striscia non ancora a listino). */
  amount: number | null;
}

/**
 * Distinta con i prezzi, com'è nel pannello Order (SPEC §12.5). La calcola il browser del cliente:
 * è una **stima**, il negozio la mostra come tale e non la usa per far pagare.
 */
export interface StoredQuote {
  pricingVersion: string;
  /** `false`: almeno una voce è senza prezzo e il totale non la comprende. */
  complete: boolean;
  lines: QuoteLine[];
  /** €, IVA esclusa, spedizione esclusa. */
  total: number;
  /** Spedizione stimata, €, fuori dal totale. */
  shipping: number;
}

export interface StoredDesign {
  v: 1;
  code: string;
  createdAt: string;
  /** Ordine normalizzato (JSON di `encodeShare`): riapre il design nel configuratore. */
  order: string;
  summary: SummaryRow[];
  /** Assente nei design salvati prima del 17 novembre 2026, o senza negozio. */
  quote?: StoredQuote;
  /** C'è una foto dell'insegna, salvata a parte con la chiave `image:<codice>`. */
  image?: boolean;
}

export interface DesignResult {
  status: number;
  body: Record<string, unknown>;
}

/** Senza 0/O, 1/I/L: il codice si legge e si detta senza errori. */
export const CODE_ALPHABET = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_PATTERN = /^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}$/;
export const DESIGN_MAX_BYTES = 1_500_000;
export const SUMMARY_MAX_ROWS = 60;
export const SUMMARY_MAX_CHARS = 240;
export const QUOTE_MAX_LINES = 20;
export const QUOTE_MAX_EUR = 100_000;
/** La foto è un JPEG di circa 1000 px: 400 kB bastano e avanzano. */
export const IMAGE_MAX_BYTES = 400_000;
const IMAGE_PREFIX = 'data:image/jpeg;base64,';
/** Un design resta 180 giorni: il tempo di una trattativa, non un archivio. */
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

/** La stima, ricopiata campo per campo: quello che non è previsto non entra nel KV. */
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
 * La foto arriva come data URL JPEG. Si tiene solo il base64, dopo aver controllato che sia
 * davvero base64, che non superi il peso massimo e che cominci come un JPEG (FF D8 FF).
 */
function imageOf(input: unknown): string | null {
  if (typeof input !== 'string' || !input.startsWith(IMAGE_PREFIX)) return null;
  const base64 = input.slice(IMAGE_PREFIX.length);
  if (base64.length === 0 || base64.length % 4 !== 0 || !/^[A-Za-z0-9+/]+={0,2}$/.test(base64)) return null;
  const padding = base64.endsWith('==') ? 2 : base64.endsWith('=') ? 1 : 0;
  if ((base64.length / 4) * 3 - padding > IMAGE_MAX_BYTES) return null;
  // «/9j/» è FF D8 FF in base64: l'inizio di ogni JPEG.
  return base64.startsWith('/9j/') ? base64 : null;
}

/** I byte di una foto salvata. */
export function imageBytes(base64: string): Uint8Array<ArrayBuffer> {
  const binary = atob(base64);
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i += 1) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

/** POST: `{ order, summary, quote?, image? }` → `{ code }`. L'ordine passa dallo stesso controllo dei link condivisi. */
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
  // Stima e foto sono facoltative, ma se ci sono devono essere a posto: niente salvataggi a metà.
  const quote = rawQuote === undefined ? null : quoteOf(rawQuote);
  if (rawQuote !== undefined && !quote) return { status: 400, body: { error: 'bad_quote' } };
  const image = rawImage === undefined ? null : imageOf(rawImage);
  if (rawImage !== undefined && !image) return { status: 400, body: { error: 'bad_image' } };

  // Otto simboli su 31: una collisione è rarissima, ma un codice occupato non si sovrascrive.
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
    // Prima la foto: se il design c'è, c'è anche lei.
    if (image) await kv.put(`image:${code}`, image, { expirationTtl: DESIGN_TTL_SECONDS });
    await kv.put(`design:${code}`, JSON.stringify(stored), { expirationTtl: DESIGN_TTL_SECONDS });
    return { status: 201, body: { code } };
  }
  return { status: 503, body: { error: 'try_again' } };
}

/**
 * GET: il riepilogo per il negozio, con il link che riapre il design. Con `full` anche l'ordine,
 * che serve al configuratore per riaprirlo.
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

/** GET della foto: i byte del JPEG, oppure null se il codice è sbagliato o la foto non c'è. */
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
