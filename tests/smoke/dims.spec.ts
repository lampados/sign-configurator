import { expect, test } from '@playwright/test';
import { expectClean, trackPage } from './guard';

for (const viewport of [
  { width: 390, height: 844 },
  { width: 1280, height: 800 },
] as const) {
  test(`footprint at ${viewport.width}×${viewport.height}: arrows on the preview, summary and Size tool`, async ({ page }) => {
    const track = trackPage(page);
    await page.setViewportSize(viewport);
    await page.goto('index.html', { waitUntil: 'load' });
    await expect(page.locator('#preview-status')).toContainText('LED');

    // «Ciao» a 12 cm è largo quasi 29 cm: la misura scelta è l'altezza delle lettere.
    await expect(page.locator('#dim-w')).toHaveText(/^width 2[89]\d mm$/);
    await expect(page.locator('#dim-h')).toHaveText(/^height 12\d mm$/);
    await expect(page.locator('#dims')).toBeVisible();

    await page.locator('[data-tool="size"]').click();
    await expect(page.locator('#size-overall')).toHaveText(/^Whole sign: 2[89](\.\d)? × 12(\.\d)? cm$/);

    await page.locator('#open-request').click();
    await expect(page.locator('#summary')).toContainText(/2[89](\.\d)? × 12(\.\d)? cm/);
    await expect(page.locator('#summary')).toContainText('Letter height');
    await expect(page.locator('#summary')).toContainText('12 cm');

    expectClean(track.problems);
  });
}
