import { expect, test, type Page } from '@playwright/test';
import { expectClean, trackPage } from './guard';

/** Prezzo voce per voce nel pannello Order (SPEC §12.5). */
async function priceOf(page: Page): Promise<Map<string, string>> {
  const terms = await page.locator('#price-lines dt').allTextContents();
  const values = await page.locator('#price-lines dd').allTextContents();
  return new Map(terms.map((term, i) => [term, values[i] ?? '']));
}

const eur = (text: string | undefined): number => Number((text ?? '').replace('€', ''));

test('Order: ogni voce ha il suo costo e la somma è il totale', async ({ page }) => {
  test.setTimeout(240_000);
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  const status = page.locator('#preview-status');
  await expect(status).toContainText('LED');

  // Una striscia con il prezzo al metro, così il totale è completo.
  await page.locator('[data-tool="tech"]').click();
  const before = await status.getAttribute('data-generation');
  await page.locator('select[name="tech-STRIP_ID"]').selectOption('ws2812b-60');
  await expect.poll(async () => status.getAttribute('data-generation'), { timeout: 60_000 }).not.toBe(before);

  await page.locator('#open-request').click();
  await expect(page.locator('#price')).toBeVisible();
  await expect(page.locator('#price h3')).toHaveText('Price');
  const price = await priceOf(page);
  const labels = [...price.keys()];
  expect(labels[0]).toBe('Controller');
  expect(price.get('Controller')).toBe('€35');
  expect(labels.some((label) => /^LED strip · \d+\.\d\d m$/.test(label))).toBe(true);
  expect(price.get('3D printing')).toBe('€7');
  expect(price.get('Margin 15 %')).toMatch(/^€\d/);
  expect(labels.at(-2)).toBe('Total, excl. VAT');
  expect(labels.at(-1)).toBe('Shipping (estimate)');
  expect(price.get('Shipping (estimate)')).toBe('€20');
  // Il montaggio costa 1 € al minuto: gli stessi minuti scritti nell'etichetta.
  const assembly = labels.find((label) => label.startsWith('Assembly · '));
  if (assembly) expect(eur(price.get(assembly))).toBe(Number(assembly.match(/(\d+) min/)![1]));
  // Le voci sopra il totale, sommate, danno il totale.
  const total = eur(price.get('Total, excl. VAT'));
  const sum = labels.slice(0, -2).reduce((acc, label) => acc + eur(price.get(label)), 0);
  expect(Math.abs(sum - total)).toBeLessThan(0.02);
  expect(total % 5).toBe(0);

  // Con un altro controller cambia la sua voce.
  await page.locator('[data-tool="tech"]').click();
  const again = await status.getAttribute('data-generation');
  await page.locator('select[name="tech-CONTROLLER_ID"]').selectOption('xiao-led-driver');
  await expect.poll(async () => status.getAttribute('data-generation'), { timeout: 60_000 }).not.toBe(again);
  await page.locator('#open-request').click();
  await expect.poll(async () => (await priceOf(page)).get('Controller')).toBe('€18');
  expectClean(track.problems);
});

test('Order: una striscia senza prezzo al metro lo dice, e il totale non la comprende', async ({ page }) => {
  const track = trackPage(page);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await page.locator('#open-request').click();
  await expect(page.locator('#price')).toBeVisible();
  const price = await priceOf(page);
  const strip = [...price.keys()].find((label) => label.startsWith('LED strip · '));
  expect(price.get(strip!)).toBe('to be quoted');
  expect(price.has('Total without the strip, excl. VAT')).toBe(true);
  expect(price.has('Total, excl. VAT')).toBe(false);
  expectClean(track.problems);
});
