// GET /api/design/<code> — the shop asks for the summary of the design, server to server.
// With ?full=1 it also returns the order: the configurator uses it to reopen the design (?d=<code>).
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
