// POST /api/design — Richiedi: salva il design e risponde con il codice che il negozio rileggerà.
// Nessun dato personale: nome, email e indirizzo si inseriscono nel negozio. Il KV si collega da
// Cloudflare Pages → Settings → Bindings, con il nome DESIGNS.
import { createDesign, type DesignKv } from '../../src/api/designStore';

interface Env {
  DESIGNS?: DesignKv;
}

export async function onRequestPost(context: { request: Request; env: Env }): Promise<Response> {
  const raw = await context.request.text();
  const result = await createDesign(raw, context.env.DESIGNS, new Date(), (n) => crypto.getRandomValues(new Uint8Array(n)));
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
