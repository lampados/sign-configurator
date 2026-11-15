// GET /api/design/<codice> — il negozio chiede il riepilogo del design, da server a server.
// Con ?full=1 risponde anche l'ordine: lo usa il configuratore per riaprire il design (?d=<codice>).
import { readDesign, type DesignKv } from '../../../src/api/designStore';

interface Env {
  DESIGNS?: DesignKv;
}

export async function onRequestGet(context: {
  request: Request;
  env: Env;
  params: { code?: string | string[] };
}): Promise<Response> {
  const url = new URL(context.request.url);
  const code = Array.isArray(context.params.code) ? (context.params.code[0] ?? '') : (context.params.code ?? '');
  const result = await readDesign(code, context.env.DESIGNS, url.origin, url.searchParams.get('full') === '1');
  return Response.json(result.body, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
}
