// POST /api/design — Richiedi: salva il design e risponde con il codice che il negozio rileggerà.
// Nessun dato personale: nome, email e indirizzo si inseriscono nel negozio. Il KV si collega da
// Cloudflare Pages → Settings → Bindings, con il nome DESIGNS.
import { createDesign, type DesignKv } from '../../src/api/designStore';
import { recordEvent, type StatsDb } from '../../src/api/statsStore';

interface Env {
  DESIGNS?: DesignKv;
  STATS?: StatsDb;
}

export async function onRequestPost(context: {
  request: Request;
  env: Env;
  waitUntil?: (promise: Promise<unknown>) => void;
}): Promise<Response> {
  const raw = await context.request.text();
  const result = await createDesign(raw, context.env.DESIGNS, new Date(), (n) => crypto.getRandomValues(new Uint8Array(n)));
  // Contatore (SPEC §14): dopo la risposta, e senza mai cambiarla. recordEvent non lancia.
  if (result.status === 201) {
    const counted = recordEvent('request', context.env.STATS, new Date());
    if (context.waitUntil) context.waitUntil(counted);
  }
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
