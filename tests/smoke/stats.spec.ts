import { expect, test, type Page } from '@playwright/test';
import { expectClean, trackPage } from './guard';

/** Contatore di download e richieste (SPEC §14): la riga sotto i pulsanti del pannello Order. */
async function openOrder(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await page.locator('#open-request').click();
  await expect(page.locator('#submit-order, #download-stl').first()).toBeVisible();
}

test('contatore non disponibile: nessun errore in console, riga assente', async ({ page }) => {
  const track = trackPage(page);
  const asked = page.waitForResponse('**/api/stats');
  await openOrder(page);
  await asked;
  await expect(page.locator('#request-stats')).toBeHidden();
  await expect(page.locator('#submit-order')).toHaveText('Send request');
  expectClean(track.problems);
});

test('contatore: i totali compaiono sotto i pulsanti, che restano uguali', async ({ page }) => {
  const track = trackPage(page);
  await page.route('**/api/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ downloads: 123, requests: 12 }) }),
  );
  await openOrder(page);
  await expect(page.locator('#request-stats')).toHaveText('123 downloads · 12 requests so far');
  await expect(page.locator('#submit-order')).toHaveText('Send request');
  expectClean(track.problems);
});

test('contatore: un totale sotto la soglia non si mostra', async ({ page }) => {
  await page.route('**/api/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ downloads: 123, requests: 3 }) }),
  );
  await openOrder(page);
  await expect(page.locator('#request-stats')).toHaveText('123 downloads so far');
});

test('contatore: su telefono stretto la riga non sposta i pulsanti', async ({ page }) => {
  let release: () => void = () => undefined;
  const held = new Promise<void>((resolve) => {
    release = resolve;
  });
  await page.route('**/api/stats', async (route) => {
    await held;
    await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ downloads: 1234, requests: 123 }) });
  });
  await page.setViewportSize({ width: 360, height: 740 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  const send = page.locator('#submit-order');
  const download = page.locator('#download-stl');
  const line = page.locator('#request-stats');
  await page.locator('#open-request').click();
  await expect(download).toBeEnabled();
  await expect(line).toBeHidden();
  const before = { send: (await send.boundingBox())!, stl: (await download.boundingBox())! };

  release();
  await expect(line).toHaveText('1234 downloads · 123 requests so far');
  const after = { send: (await send.boundingBox())!, stl: (await download.boundingBox())!, line: (await line.boundingBox())! };
  // Stessa disposizione di prima: la riga occupa una riga sua, sotto i pulsanti e dentro lo schermo.
  expect(after.stl.x - after.send.x).toBeCloseTo(before.stl.x - before.send.x, 0);
  expect(after.stl.y - after.send.y).toBeCloseTo(before.stl.y - before.send.y, 0);
  expect(after.line.y).toBeGreaterThanOrEqual(Math.max(after.send.y + after.send.height, after.stl.y + after.stl.height) - 1);
  expect(after.line.y + after.line.height).toBeLessThanOrEqual(740);
});

test('Download STL manda un solo evento, senza dati personali', async ({ page }) => {
  const events: string[] = [];
  await page.route('**/api/event', async (route) => {
    events.push(route.request().postData() ?? '');
    await route.fulfill({ status: 204 });
  });
  await openOrder(page);
  const download = page.locator('#download-stl');
  await expect(download).toBeEnabled();
  const saved = page.waitForEvent('download');
  await download.click();
  await saved;
  await expect.poll(() => events.length).toBe(1);
  expect(JSON.parse(events[0]!)).toEqual({ type: 'stl' });
});
