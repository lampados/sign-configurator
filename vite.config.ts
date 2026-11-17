import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Connect, Plugin } from 'vite';

const root = import.meta.dirname;

// `vite build --mode public` (npm run build:public): la pagina cliente e la pagina parts. Debug, bend test
// e spec si usano in locale (SPEC §7).
const PUBLIC_PAGES = ['index', 'parts'];
const ALL_PAGES: Record<string, string> = {
  index: 'index.html',
  parts: 'parts.html',
  debug: 'debug.html',
  bendTest: 'bend-test.html',
  spec: 'spec.html',
};

/**
 * `vite` e `vite preview` non eseguono le Pages Functions: il contatore (SPEC §14) risponde come un
 * sito senza database, così in locale e nei test la console resta pulita e la riga non compare.
 */
function statsStub(): Plugin {
  const stub: Connect.NextHandleFunction = (req, res, next) => {
    const path = (req.url ?? '').split('?')[0]!;
    if (path.endsWith('/api/stats') && req.method === 'GET') {
      res.setHeader('Content-Type', 'application/json');
      res.end('{"downloads":null,"requests":null}');
      return;
    }
    if (path.endsWith('/api/event') && req.method === 'POST') {
      res.statusCode = 204;
      res.end();
      return;
    }
    next();
  };
  return {
    name: 'stats-stub',
    configureServer: (server) => void server.middlewares.use(stub),
    configurePreviewServer: (server) => void server.middlewares.use(stub),
  };
}

export default defineConfig(({ command, isPreview, mode }) => ({
  // Cloudflare Pages (CF_PAGES=1 durante il build) serve dalla radice; GitHub Pages da
  // https://lampados.github.io/sign-configurator/
  base: (command === 'build' || isPreview) && !process.env.CF_PAGES ? '/sign-configurator/' : '/',
  appType: 'mpa',
  plugins: [statsStub()],
  build: {
    target: 'es2022',
    rollupOptions: {
      input: Object.fromEntries(
        Object.entries(ALL_PAGES)
          .filter(([name]) => mode !== 'public' || PUBLIC_PAGES.includes(name))
          .map(([name, file]) => [name, resolve(root, file)]),
      ),
    },
  },
  // Il pre-bundling sposterebbe manifold.js in .vite/deps, rompendo il suo
  // new URL('manifold.wasm', import.meta.url): l'URL del .wasm lo passiamo noi.
  optimizeDeps: {
    exclude: ['manifold-3d'],
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}));
