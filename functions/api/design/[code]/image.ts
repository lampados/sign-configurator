// GET /api/design/<code>/image — the photo of the sign taken at "Send request".
// The shop shows it in the cart and keeps a copy in the order. Always and only a JPEG.
import { readDesignImage, type DesignKv } from '../../../../src/api/designStore';

interface Env {
  DESIGNS?: DesignKv;
}

export async function onRequestGet(context: { env: Env; params: { code?: string | string[] } }): Promise<Response> {
  const code = Array.isArray(context.params.code) ? (context.params.code[0] ?? '') : (context.params.code ?? '');
  const result = await readDesignImage(code, context.env.DESIGNS);
  if (!result.bytes) return new Response(null, { status: result.status, headers: { 'Cache-Control': 'no-store' } });
  return new Response(result.bytes, {
    status: 200,
    headers: {
      'Content-Type': 'image/jpeg',
      'Content-Length': String(result.bytes.length),
      'X-Content-Type-Options': 'nosniff',
      // The photo of a code never changes: the customer's browser may keep it.
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
