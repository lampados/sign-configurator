import { resolve } from 'node:path';
import { defineConfig } from 'vitest/config';
import type { Connect, Plugin } from 'vite';

const root = import.meta.dirname;

// `vite build --mode public` (npm run build:public): the customer page and the parts page. Debug, bend test
// and spec are used locally (SPEC §7).
const PUBLIC_PAGES = ['index', 'parts'];
const ALL_PAGES: Record<string, string> = {
  index: 'index.html',
  parts: 'parts.html',
  debug: 'debug.html',
  bendTest: 'bend-test.html',
  spec: 'spec.html',
};

/**
 * `vite` and `vite preview` do not run the Pages Functions: the counter (SPEC §14) answers like a
 * site without a database, so locally and in the tests the console stays clean and the row does not appear.
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
  // Cloudflare Pages (CF_PAGES=1 during the build) serves from the root; GitHub Pages from
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
  // Pre-bundling would move manifold.js into .vite/deps, breaking its
  // new URL('manifold.wasm', import.meta.url): we pass the URL of the .wasm ourselves. harfbuzzjs finds
  // its .wasm the same way, and outside pre-bundling the URL stays right.
  optimizeDeps: {
    exclude: ['manifold-3d', 'harfbuzzjs'],
  },
  worker: {
    format: 'es',
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
}));
