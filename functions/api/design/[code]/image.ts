// GET /api/design/<codice>/image — la foto dell'insegna scattata al momento di «Send request».
// Il negozio la mostra nel carrello e ne tiene una copia nell'ordine. Sempre e solo un JPEG.
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
      // La foto di un codice non cambia mai: il browser del cliente la può tenere.
      'Cache-Control': 'public, max-age=86400, immutable',
    },
  });
}
