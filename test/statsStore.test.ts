import { describe, expect, it } from 'vitest';
import { readStats, recordEvent, sameOrigin, statsLine, type StatsDb, type StatsStatement } from '../src/api/statsStore';

/** Fake D1: it keeps the rows in memory and understands the two queries of the module. */
function memoryDb(): StatsDb & { rows: { type: string; ts: string }[] } {
  const rows: { type: string; ts: string }[] = [];
  return {
    rows,
    prepare(query: string): StatsStatement {
      let bound: unknown[] = [];
      const statement: StatsStatement = {
        bind: (...values) => {
          bound = values;
          return statement;
        },
        run: async () => {
          if (!query.startsWith('INSERT')) throw new Error('query');
          rows.push({ type: String(bound[0]), ts: String(bound[1]) });
        },
        all: async <T>() => {
          const counts = new Map<string, number>();
          for (const row of rows) counts.set(row.type, (counts.get(row.type) ?? 0) + 1);
          return { results: [...counts].map(([type, n]) => ({ type, n })) as T[] };
        },
      };
      return statement;
    },
  };
}

const brokenDb: StatsDb = {
  prepare: () => {
    throw new Error('D1 down');
  },
};
const NOW = new Date('2026-11-17T10:00:00Z');
const TEXT = { downloads: (n: number) => `${n} downloads`, requests: (n: number) => `${n} requests`, suffix: 'so far' };

describe('statsStore', () => {
  it('records type and time, and nothing else', async () => {
    const db = memoryDb();
    expect(await recordEvent('stl', db, NOW)).toBe(true);
    expect(db.rows).toEqual([{ type: 'stl', ts: '2026-11-17T10:00:00.000Z' }]);
  });

  it('rejects an invalid type', async () => {
    const db = memoryDb();
    for (const type of ['order', '', 'STL', 7, null, undefined]) expect(await recordEvent(type, db, NOW)).toBe(false);
    expect(db.rows).toEqual([]);
  });

  it('without a database, or if the database fails, it does not throw', async () => {
    expect(await recordEvent('stl', undefined, NOW)).toBe(false);
    expect(await recordEvent('request', brokenDb, NOW)).toBe(false);
    expect(await readStats(undefined)).toBeNull();
    expect(await readStats(brokenDb)).toBeNull();
  });

  it('counts downloads and requests', async () => {
    const db = memoryDb();
    expect(await readStats(db)).toEqual({ downloads: 0, requests: 0 });
    for (let i = 0; i < 3; i += 1) await recordEvent('stl', db, NOW);
    await recordEvent('request', db, NOW);
    expect(await readStats(db)).toEqual({ downloads: 3, requests: 1 });
  });

  it('accepts only the page served by the same host', () => {
    const url = 'https://sign-configurator.pages.dev/api/event';
    expect(sameOrigin(url, 'https://sign-configurator.pages.dev', null)).toBe(true);
    expect(sameOrigin(url, null, 'https://sign-configurator.pages.dev/index.html')).toBe(true);
    expect(sameOrigin(url, 'https://fork.pages.dev', null)).toBe(false);
    expect(sameOrigin(url, 'null', 'https://fork.pages.dev/')).toBe(false);
    expect(sameOrigin(url, null, null)).toBe(false);
    expect(sameOrigin(url, 'non un url', null)).toBe(false);
  });

  it('the line shows each total only from the threshold up', () => {
    expect(statsLine({ downloads: 123, requests: 12 }, 10, TEXT)).toBe('123 downloads · 12 requests so far');
    expect(statsLine({ downloads: 123, requests: 9 }, 10, TEXT)).toBe('123 downloads so far');
    expect(statsLine({ downloads: 9, requests: 10 }, 10, TEXT)).toBe('10 requests so far');
    expect(statsLine({ downloads: 9, requests: 9 }, 10, TEXT)).toBe('');
    expect(statsLine({ downloads: null, requests: null }, 10, TEXT)).toBe('');
    expect(statsLine({}, 10, TEXT)).toBe('');
    expect(statsLine(null, 10, TEXT)).toBe('');
  });
});
