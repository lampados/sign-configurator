import { expect, test, type Page } from '@playwright/test';
import { expectClean, trackPage } from './guard';

/** Counter of downloads and requests (SPEC §14): the row under the buttons of the Order panel. */
async function openOrder(page: Page): Promise<void> {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await page.locator('#open-request').click();
  await expect(page.locator('#submit-order, #download-stl').first()).toBeVisible();
}

test('counter unavailable: no console errors, line absent', async ({ page }) => {
  const track = trackPage(page);
  const asked = page.waitForResponse('**/api/stats');
  await openOrder(page);
  await asked;
  await expect(page.locator('#request-stats')).toBeHidden();
  await expect(page.locator('#submit-order')).toHaveText('Send request');
  expectClean(track.problems);
});

test('counter: the totals appear under the buttons, which stay the same', async ({ page }) => {
  const track = trackPage(page);
  await page.route('**/api/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ downloads: 123, requests: 12 }) }),
  );
  await openOrder(page);
  await expect(page.locator('#request-stats')).toHaveText('123 downloads · 12 requests so far');
  await expect(page.locator('#submit-order')).toHaveText('Send request');
  expectClean(track.problems);
});

test('counter: a total under the threshold is not shown', async ({ page }) => {
  await page.route('**/api/stats', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ downloads: 123, requests: 3 }) }),
  );
  await openOrder(page);
  await expect(page.locator('#request-stats')).toHaveText('123 downloads so far');
});

test('counter: on a narrow phone the line does not move the buttons', async ({ page }) => {
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
  // Same layout as before: the row takes a row of its own, under the buttons and inside the screen.
  expect(after.stl.x - after.send.x).toBeCloseTo(before.stl.x - before.send.x, 0);
  expect(after.stl.y - after.send.y).toBeCloseTo(before.stl.y - before.send.y, 0);
  expect(after.line.y).toBeGreaterThanOrEqual(Math.max(after.send.y + after.send.height, after.stl.y + after.stl.height) - 1);
  expect(after.line.y + after.line.height).toBeLessThanOrEqual(740);
});

test('Download STL sends a single event, without personal data', async ({ page }) => {
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

test('coffee invitation: under the name and under "Download STL", links only', async ({ page }) => {
  const track = trackPage(page);
  await openOrder(page);
  const support = 'https://support.example.test/ciao';
  const brand = page.locator('#support-brand');
  await expect(brand).toHaveText('☕ Offer me a coffee');
  await expect(brand).toHaveAttribute('href', support);
  await expect(brand).toHaveAttribute('target', '_blank');
  const note = page.locator('#support-note');
  await expect(note).toHaveText('Printing it yourself? Offer me a coffee: espresso, doppio or corretto.');
  await expect(note.locator('a')).toHaveAttribute('href', support);
  await expect(note.locator('a')).toHaveAttribute('rel', 'noopener');
  // It sits under the buttons and does not move them.
  const [button, line] = await Promise.all([page.locator('#download-stl').boundingBox(), note.boundingBox()]);
  expect(line!.y).toBeGreaterThanOrEqual(button!.y + button!.height);
  // No third-party request: the donation page opens only with a click.
  expectClean(track.problems);
});
