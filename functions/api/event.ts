// POST /api/event — conta un click su «Download STL» (SPEC §14). Corpo: { "type": "stl" }.
// Le richieste si contano in /api/design, non da qui. Il D1 si collega da Cloudflare Pages →
// Settings → Bindings, con il nome STATS; senza, l'evento si accetta e non si conta.
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
