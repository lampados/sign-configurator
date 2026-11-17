// Contatore anonimo: quante volte è stato scaricato l'STL e quante è partita una richiesta. Una riga
// per evento, con tipo e ora: nessun IP, nessun cookie, nessun dato personale. Modulo puro: lo usano
// le Pages Functions e i test.

/** Quello che serve di un database D1 di Cloudflare: così i test usano un finto in memoria. */
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
 * Registra un evento. Risponde false se il tipo non è valido, se il database non è collegato o se
 * la scrittura fallisce: chi chiama non deve mai fermarsi per il contatore.
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

/** I due totali, o null se il database non è collegato o non risponde. */
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
 * L'evento arriva dalla pagina servita dallo stesso host della Function: nessun dominio scritto nel
 * codice, così vale su pages.dev, sulle anteprime e nei fork. Senza Origin si guarda il Referer.
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

/** Riga sotto i pulsanti: ogni totale compare solo da `min` in su. Stringa vuota: niente riga. */
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
