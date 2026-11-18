import { expect, test } from '@playwright/test';
import { expectClean, trackPage } from './guard';

const PAGES = ['index.html', 'bend-test.html', 'spec.html'] as const;

for (const file of PAGES) {
  test(`${file} opens without console or network errors`, async ({ page }) => {
    const track = trackPage(page);
    await page.goto(file, { waitUntil: 'load' });

    if (file === 'index.html') {
      await expect(page.locator('h1')).toHaveText('Ciao, a WYSIWYG Sign Configurator');
    }
    if (file === 'spec.html') {
      await expect(page.locator('#spec h1').first()).toBeVisible();
    }
    if (file === 'bend-test.html') {
      await expect(page.locator('#download-arcs')).toBeEnabled();
      await expect(page.locator('#download-corners')).toBeEnabled();
      expect(track.wasmOk(), 'manifold.wasm not loaded').toBe(true);
    }

    expectClean(track.problems);
  });
}
