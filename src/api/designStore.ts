// Design salvati per il negozio (Richiedi): il configuratore salva il design e riceve un codice, il
// negozio lo rilegge da server a server. Qui non passa mai un dato personale: nome, email e indirizzo
// si inseriscono solo nel negozio. Modulo puro: lo usano le Pages Functions e i test.

import { decodeShare, encodeShare } from '../order/share';

/** Quello che serve di un KV di Cloudflare: così i test usano una mappa. */
export interface DesignKv {
  get(key: string): Promise<string | null>;
  put(key: string, value: string, options?: { expirationTtl?: number }): Promise<void>;
}

/** Riga del riepilogo, come la vede il cliente: etichetta e valore. */
export type SummaryRow = [label: string, value: string];

export interface StoredDesign {
  v: 1;
  code: string;
  createdAt: string;
  /** Ordine normalizzato (JSON di `encodeShare`): riapre il design nel configuratore. */
  order: string;
  summary: SummaryRow[];
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

/** POST: `{ order, summary }` → `{ code }`. L'ordine passa dallo stesso controllo dei link condivisi. */
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
  const { order, summary } = parsed as { order?: unknown; summary?: unknown };
  const read = decodeShare(JSON.stringify(order ?? null));
  if (!read.order) return { status: 400, body: { error: 'bad_order' } };
  const rows = summaryOf(summary);
  if (!rows) return { status: 400, body: { error: 'bad_summary' } };

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
    };
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
  if (full) body.order = stored.order;
  return { status: 200, body };
}
