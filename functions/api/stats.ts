// GET /api/stats — i totali del contatore (SPEC §14): { downloads, requests }. Senza il D1 STATS
// risponde { downloads: null, requests: null }: la pagina non mostra la riga e la console resta pulita.
import { readStats, type StatsDb } from '../../src/api/statsStore';

interface Env {
  STATS?: StatsDb;
}

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const stats = await readStats(context.env.STATS);
  if (!stats) return Response.json({ downloads: null, requests: null }, { headers: { 'Cache-Control': 'no-store' } });
  return Response.json(stats, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
