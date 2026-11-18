import { expect, type Page } from '@playwright/test';

const FAVICON = 'favicon.ico';

/** Console errors and failed requests (the 404 of favicon.ico is not the app's). */
export function trackPage(page: Page): { problems: () => string[]; wasmOk: () => boolean } {
  const problems: string[] = [];
  let wasmOk = false;

  page.on('console', (msg) => {
    if (msg.type() !== 'error' || msg.text().includes(FAVICON)) return;
    problems.push(`console: ${msg.text()}`);
  });
  page.on('pageerror', (err) => {
    problems.push(`pageerror: ${err.message}`);
  });
  page.on('requestfailed', (req) => {
    if (req.url().includes(FAVICON)) return;
    problems.push(`rete: ${req.failure()?.errorText ?? 'failed'} ${req.url()}`);
  });
  page.on('response', (res) => {
    const url = res.url();
    if (url.includes(FAVICON)) return;
    // Vite renames the asset (`manifold-<hash>.wasm`): any .wasm that loaded successfully counts.
    if (url.includes('.wasm') && res.ok()) wasmOk = true;
    if (res.status() >= 400) problems.push(`HTTP ${res.status()} ${url}`);
  });

  return {
    problems: () => problems,
    wasmOk: () => wasmOk,
  };
}

export function expectClean(problems: () => string[]): void {
  expect(problems(), problems().join('\n')).toEqual([]);
}
