// POST /api/request — Request: verifies Turnstile, recomputes the price, creates the WooCommerce order
// (SPEC §11, §12.7). PLACEHOLDER: answers 501. Secrets come from the Cloudflare variables
// (names in .dev.vars.example), never from the repo.
export async function onRequestPost(): Promise<Response> {
  return Response.json({ error: 'not_implemented' }, { status: 501 });
}
