// Anonymous counter: how many times the STL was downloaded and how many a request was sent. One row
// per event, with type and time: no IP, no cookie, no personal data. Pure module: used by
// the Pages Functions and the tests.

/** What is needed of a Cloudflare D1 database: this way the tests use an in-memory fake. */
export interface StatsStatement {
  bind(...values: unknown[]): StatsStatement;
  run(): Promise<unknown>;
  all<T>(): Promise<{ results?: T[] }>;
}
export interface StatsDb {
  prepare(query: string): StatsStatement;
}

export const EVENT_TYPES = ['stl', 'request'] as const;
export type EventType = (typeof EVENT_TYPES)[number];

export interface Stats {
  downloads: number;
  requests: number;
}

export function isEventType(value: unknown): value is EventType {
  return typeof value === 'string' && (EVENT_TYPES as readonly string[]).includes(value);
}

/**
 * Records an event. Returns false if the type is not valid, if the database is not bound or if
 * the write fails: the caller must never stop because of the counter.
 */
export async function recordEvent(type: unknown, db: StatsDb | undefined, now: Date): Promise<boolean> {
  if (!db || !isEventType(type)) return false;
  try {
    await db.prepare('INSERT INTO events (type, ts) VALUES (?, ?)').bind(type, now.toISOString()).run();
    return true;
  } catch {
    return false;
  }
}

/** The two totals, or null if the database is not bound or does not answer. */
export async function readStats(db: StatsDb | undefined): Promise<Stats | null> {
  if (!db) return null;
  try {
    const { results } = await db.prepare('SELECT type, COUNT(*) AS n FROM events GROUP BY type').all<{ type: string; n: number }>();
    const stats: Stats = { downloads: 0, requests: 0 };
    for (const row of results ?? []) {
      if (row.type === 'stl') stats.downloads = Number(row.n) || 0;
      if (row.type === 'request') stats.requests = Number(row.n) || 0;
    }
    return stats;
  } catch {
    return null;
  }
}

/**
 * The event comes from the page served by the same host as the Function: no domain written in the
 * code, so it works on pages.dev, on previews and in forks. Without Origin the Referer is checked.
 */
export function sameOrigin(requestUrl: string, origin: string | null, referer: string | null): boolean {
  const source = origin && origin !== 'null' ? origin : referer;
  if (!source) return false;
  try {
    return new URL(source).host === new URL(requestUrl).host;
  } catch {
    return false;
  }
}

/** Line under the buttons: each total appears only from `min` up. Empty string: no line. */
export function statsLine(
  stats: { downloads?: unknown; requests?: unknown } | null,
  min: number,
  text: { downloads: (n: number) => string; requests: (n: number) => string; suffix: string },
): string {
  if (!stats) return '';
  const parts: string[] = [];
  const shown = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= min;
  if (shown(stats.downloads)) parts.push(text.downloads(Math.floor(stats.downloads)));
  if (shown(stats.requests)) parts.push(text.requests(Math.floor(stats.requests)));
  return parts.length ? `${parts.join(' · ')} ${text.suffix}` : '';
}
