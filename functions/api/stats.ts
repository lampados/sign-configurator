// GET /api/stats — the totals of the counter (SPEC §14): { downloads, requests }. Without the STATS D1
// it answers { downloads: null, requests: null }: the page does not show the line and the console stays clean.
import { readStats, type StatsDb } from '../../src/api/statsStore';

interface Env {
  STATS?: StatsDb;
}

export async function onRequestGet(context: { env: Env }): Promise<Response> {
  const stats = await readStats(context.env.STATS);
  if (!stats) return Response.json({ downloads: null, requests: null }, { headers: { 'Cache-Control': 'no-store' } });
  return Response.json(stats, { headers: { 'Cache-Control': 'public, max-age=300' } });
}
