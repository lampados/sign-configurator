import { expect, test, type Page } from '@playwright/test';
import { expectClean, trackPage } from './guard';

/**
 * "Ciao" in Sacramento with the default strip cannot be sent at any size (merging
 * outlines, tight curves): the test uses Beon at 18 cm, which passes.
 */
async function sendable(page: Page): Promise<void> {
  const status = page.locator('#preview-status');
  await page.locator('[data-tool="font"]').click();
  await page.locator('.font-card[data-font="beon"]').click();
  await page.locator('[data-tool="size"]').click();
  const before = await status.getAttribute('data-generation');
  await page.locator('.size-chip[data-size="180"]').click();
  await expect.poll(async () => status.getAttribute('data-generation'), { timeout: 60_000 }).not.toBe(before);
}

test('Send request: saves the design without personal data and goes to the shop cart', async ({ page }) => {
  const track = trackPage(page);
  let posted: {
    order?: { source?: { text?: string } };
    summary?: [string, string][];
    quote?: { complete: boolean; total: number; shipping: number; lines: { id: string; label: string; detail: string; amount: number | null }[] };
    image?: string;
  } | null = null;
  await page.route('**/api/design', async (route) => {
    posted = JSON.parse(route.request().postData() ?? '{}') as typeof posted;
    await route.fulfill({ status: 201, contentType: 'application/json', body: JSON.stringify({ code: 'K7F3-92QD' }) });
  });
  await page.route('https://shop.example.test/**', (route) =>
    route.fulfill({ status: 200, contentType: 'text/html', body: '<title>shop</title>' }),
  );

  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await sendable(page);
  await page.locator('#open-request').click();
  await expect(page.locator('#request-note')).toContainText('on our shop');
  const send = page.locator('#submit-order');
  await expect(send).toHaveText('Send request');
  await expect(send).toBeEnabled();
  await send.click();

  await page.waitForURL('https://shop.example.test/?add-to-cart=1637&design=K7F3-92QD');
  expect(posted!.order?.source?.text).toBe('Ciao');
  const labels = posted!.summary!.map(([label]) => label);
  expect(labels).toContain('Assembly');
  // The summary stays short: prices are not text rows, they travel in the estimate.
  expect(labels.some((label) => label.startsWith('Price'))).toBe(false);
  const quote = posted!.quote!;
  expect(quote.lines[0]).toMatchObject({ id: 'controller', label: 'Controller', amount: 35 });
  expect(quote.lines[0]!.detail).toContain('GL-C-309WL');
  expect(quote.lines.find((line) => line.id === 'strip')?.detail).toMatch(/LED\/m.* · \d+\.\d\d m$/);
  expect(quote.complete).toBe(true);
  expect(quote.shipping).toBe(20);
  const sum = quote.lines.reduce((total, line) => total + (line.amount ?? 0), 0);
  expect(Math.abs(sum - quote.total)).toBeLessThan(0.02);
  // The photo: a 4:3 JPEG in the standard view, light.
  expect(posted!.image).toMatch(/^data:image\/jpeg;base64,\/9j\//);
  expect(posted!.image!.length).toBeGreaterThan(8_000);
  expect(posted!.image!.length).toBeLessThan(500_000);
  const size = await page.evaluate(async (url) => {
    const image = new Image();
    image.src = url;
    await image.decode();
    return [image.naturalWidth, image.naturalHeight];
  }, posted!.image!);
  expect(size).toEqual([1000, 750]);
  // No contact field leaves the configurator.
  expect(Object.keys(posted!).sort()).toEqual(['image', 'order', 'quote', 'summary']);
  expectClean(track.problems);
});

test('Send request: if saving fails the page stays and says so', async ({ page }) => {
  await page.route('**/api/design', (route) =>
    route.fulfill({ status: 503, contentType: 'application/json', body: JSON.stringify({ error: 'storage_not_configured' }) }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await sendable(page);
  await page.locator('#open-request').click();
  await expect(page.locator('#submit-order')).toBeEnabled();
  await page.locator('#submit-order').click();
  await expect(page.locator('#request-note')).toContainText('Could not send the design');
  await expect(page.locator('#submit-order')).toHaveText('Send request');
  expect(new URL(page.url()).hostname).not.toBe('shop.example.test');
});

test('?d=<code> reopens the saved design', async ({ page }) => {
  const track = trackPage(page);
  const order = {
    schemaVersion: 4,
    generatorVersion: '0.2.0',
    pricingVersion: null,
    source: { kind: 'text', text: 'Neon', fontId: 'sacramento' },
    heightMm: 180,
    sizePreset: 'L',
    color: '#ff2fd6',
    params: {},
    paths: null,
    crossings: [],
    customer: { effect: 'colore fisso', diffuser: true, mount: 'wall', plug: 'EU', proof: true },
    plate: null,
  };
  await page.route('**/api/design/K7F3-92QD?full=1', (route) =>
    route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ code: 'K7F3-92QD', order: JSON.stringify(order) }) }),
  );
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html?d=K7F3-92QD', { waitUntil: 'load' });
  await expect(page.locator('input[name="text"]')).toHaveValue('Neon');
  await expect(page.locator('input[name="heightMm"]')).toHaveValue('180');
  await expect(page.locator('#preview-status')).toContainText('LED');
  expect(page.url()).not.toContain('d=K7F3');
  expectClean(track.problems);
});
