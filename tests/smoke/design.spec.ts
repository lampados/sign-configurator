import { expect, test, type Page } from '@playwright/test';
import { expectClean, trackPage } from './guard';

async function generation(page: Page): Promise<number> {
  return Number(await page.locator('#preview-status').getAttribute('data-generation'));
}

async function waitNext(page: Page, before: number): Promise<void> {
  await expect.poll(() => generation(page)).toBeGreaterThan(before);
}

test('design: survives a reload, reopens from a link, Start over resets it', async ({ page, context }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');

  let before = await generation(page);
  await page.locator('input[name="text"]').fill('Hey');
  await waitNext(page, before);
  before = await generation(page);
  await page.locator('.size-chip[data-size="180"]').click();
  await waitNext(page, before);
  await expect(page.locator('#share-design')).toBeEnabled();

  // Reload: text and size come back from the browser.
  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('input[name="text"]')).toHaveValue('Hey');
  await expect(page.locator('input[name="heightMm"]')).toHaveValue('180');
  await expect(page.locator('#preview-status')).toContainText('LED');

  // Link: a page without storage rebuilds the same design, and the hash disappears from the address.
  await page.locator('[data-tool="more"]').click();
  await page.locator('#share-design').click();
  await expect(page.locator('#design-note')).toHaveAttribute('data-link', /#o=/);
  const link = (await page.locator('#design-note').getAttribute('data-link'))!;
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(link);

  const fresh = await context.browser()!.newContext();
  const other = await fresh.newPage();
  await other.goto(link, { waitUntil: 'load' });
  await expect(other.locator('input[name="text"]')).toHaveValue('Hey');
  await expect(other.locator('input[name="heightMm"]')).toHaveValue('180');
  await expect(other.locator('#preview-status')).toContainText('LED');
  expect(other.url()).not.toContain('#o=');
  await fresh.close();

  // Start over: "Ciao" again.
  page.once('dialog', (dialog) => void dialog.accept());
  await page.locator('#new-design').click();
  await expect(page.locator('input[name="text"]')).toHaveValue('Ciao');
  await expect(page.locator('#preview-status')).toContainText('LED');

  expectClean(track.problems);
});

test('design: a broken link does not block the page', async ({ page }) => {
  const track = trackPage(page);
  await page.goto('index.html#o=non-un-design', { waitUntil: 'load' });
  await expect(page.locator('input[name="text"]')).toHaveValue('Ciao');
  await expect(page.locator('#preview-status')).toContainText('LED');
  await expect(page.locator('#design-note')).toHaveText('Could not open this link.');
  expectClean(track.problems);
});

test('design: edited paths survive a reload', async ({ page }) => {
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await expect(page.locator('#restore-paths')).toBeDisabled();

  const before = await generation(page);
  await page.locator('[data-tool="more"]').click();
  await page.locator('#edit-paths').click();
  await expect(page.locator('#restore-paths')).toBeEnabled();
  await waitNext(page, before);

  await page.reload({ waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await expect(page.locator('#restore-paths')).toBeEnabled();
  const stored = await page.evaluate(() => window.localStorage.getItem('sign-configurator:design:v1'));
  expect(JSON.parse(stored ?? '{}').paths?.length ?? 0).toBeGreaterThan(0);

  expectClean(track.problems);
});
