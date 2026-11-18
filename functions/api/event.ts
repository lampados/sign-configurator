// POST /api/event — counts a click on "Download STL" (SPEC §14). Body: { "type": "stl" }.
// Requests are counted in /api/design, not here. The D1 is bound from Cloudflare Pages →
// Settings → Bindings, with the name STATS; without it, the event is accepted and not counted.
import { recordEvent, sameOrigin, type StatsDb } from '../../src/api/statsStore';

interface Env {
  STATS?: StatsDb;
}

const HEADERS = { 'Cache-Control': 'no-store' };

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const { request } = context;
  if (!sameOrigin(request.url, request.headers.get('Origin'), request.headers.get('Referer'))) {
    return new Response(null, { status: 403, headers: HEADERS });
  }
  let type: unknown;
  try {
    type = ((await request.json()) as { type?: unknown } | null)?.type;
  } catch {
    type = undefined;
  }
  if (type !== 'stl') return new Response(null, { status: 400, headers: HEADERS });
  await recordEvent(type, context.env.STATS, new Date());
  return new Response(null, { status: 204, headers: HEADERS });
}
