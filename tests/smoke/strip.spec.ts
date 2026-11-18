import { expect, test } from '@playwright/test';
import { expectClean, trackPage } from './guard';

test('Tech: the strip menu rewrites the measurements', async ({ page }) => {
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await page.locator('[data-tool="tech"]').click();

  const strip = page.locator('select[name="tech-STRIP_ID"]');
  const stripW = page.locator('input[name="tech-STRIP_W"]');
  const stripT = page.locator('input[name="tech-STRIP_T"]');
  const channelW = page.locator('input[name="tech-CHANNEL_W"]');
  const channelD = page.locator('input[name="tech-CHANNEL_DEPTH"]');
  const density = page.locator('select[name="tech-LED_PER_M"]');

  // Il modello è la prima voce del gruppo, con il disegno della striscia subito sotto.
  const group = page.locator('fieldset.tech-group', { has: strip });
  await expect(group.locator('input, select').first()).toHaveAttribute('name', 'tech-STRIP_ID');
  const figure = page.locator('#strip-figure svg');
  await expect(figure).toBeVisible();

  // La COB da 5 mm: misure più piccole, canale stretto, 160 LED/m fuori scala → resta il default.
  await strip.selectOption('cob-5mm');
  await expect(stripW).toHaveValue('5');
  await expect(stripT).toHaveValue('2');
  await expect(channelW).toHaveValue('5.4');
  await expect(channelD).toHaveValue('8');
  await expect(figure.locator('[data-led]')).toHaveCount(11);
  await expect(figure).toContainText('bends sideways');

  // Una WS2812B normale: 10 × 2, 60 LED/m, e il menu avvisa che non segue le curve.
  await strip.selectOption('ws2812b-60');
  await expect(stripW).toHaveValue('10');
  await expect(channelW).toHaveValue('10.4');
  await expect(density).toHaveValue('60');
  await expect(strip.locator('option[value="ws2812b-60"]')).toContainText('cut over 30°');
  await expect(figure.locator('[data-led]')).toHaveCount(4);
  await expect(figure).toContainText('bends 30° per LED, cut beyond');

  // Su un corsivo la striscia si taglia a ogni curva: il riepilogo conta i tagli e il tempo.
  const status = page.locator('#preview-status');
  await expect.poll(async () => Number(await status.getAttribute('data-cuts')), { timeout: 90_000 }).toBeGreaterThan(0);
  const cuts = Number(await status.getAttribute('data-cuts'));
  await page.locator('#open-request').click();
  await expect(page.locator('#summary')).toContainText(`${cuts} strip cuts`);
  await expect(page.locator('#summary')).toContainText('Assembly');
  await page.locator('[data-tool="tech"]').click();

  // La COB segue le curve: nessun taglio.
  await strip.selectOption('cob-5mm');
  await expect.poll(async () => Number(await status.getAttribute('data-cuts')), { timeout: 90_000 }).toBe(0);

  await page.locator('#tech-reset').click();
  await expect(strip).toHaveValue('ws2812b-144');
  await expect(stripW).toHaveValue('10');
  await expect(channelD).toHaveValue('8');

  expectClean(track.problems);
});
