// POST /api/design — Request: saves the design and answers with the code the shop will read back.
// No personal data: name, email and address are entered in the shop. The KV is bound from
// Cloudflare Pages → Settings → Bindings, with the name DESIGNS.
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
  // Counter (SPEC §14): after the response, and never changing it. recordEvent does not throw.
  if (result.status === 201) {
    const counted = recordEvent('request', context.env.STATS, new Date());
    if (context.waitUntil) context.waitUntil(counted);
  }
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
