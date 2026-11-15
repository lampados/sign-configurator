import { expect, test } from '@playwright/test';
import { expectClean, trackPage } from './guard';

test('Tecnica: il menu della striscia riscrive le misure', async ({ page }) => {
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

  // La COB da 5 mm: misure più piccole, canale stretto, 160 LED/m fuori scala → resta il default.
  await strip.selectOption('cob-5mm');
  await expect(stripW).toHaveValue('5');
  await expect(stripT).toHaveValue('2');
  await expect(channelW).toHaveValue('5.4');
  await expect(channelD).toHaveValue('8');

  // Una WS2812B normale: 10 × 2, 60 LED/m, e il menu avvisa che non segue le curve.
  await strip.selectOption('ws2812b-60');
  await expect(stripW).toHaveValue('10');
  await expect(channelW).toHaveValue('10.4');
  await expect(density).toHaveValue('60');
  await expect(strip.locator('option[value="ws2812b-60"]')).toContainText('non curva');

  // Su un corsivo la pagina spiega perché non va, invece di dire solo «ingrandisci».
  await expect(page.locator('#preview-status')).toContainText('does not bend sideways', { timeout: 90_000 });

  await page.locator('#tech-reset').click();
  await expect(strip).toHaveValue('ws2812b-60');
  await expect(stripW).toHaveValue('10');
  await expect(channelD).toHaveValue('8');

  expectClean(track.problems);
});
