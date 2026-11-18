import { expect, test } from '@playwright/test';
import { expectClean, trackPage } from './guard';

test('Tech: the channel follows the strip, and a channel that is too narrow says so', async ({ page }) => {
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await page.locator('[data-tool="tech"]').click();

  const stripW = page.locator('input[name="tech-STRIP_W"]');
  const stripT = page.locator('input[name="tech-STRIP_T"]');
  const channelW = page.locator('input[name="tech-CHANNEL_W"]');
  const channelD = page.locator('input[name="tech-CHANNEL_DEPTH"]');
  const slotW = page.locator('input[name="tech-WIRE_SLOT_W"]');
  await expect(channelW).toHaveValue('10.4');

  // The strip gets narrower: channel and slot follow it, with the 0.4 mm tolerance.
  await stripW.fill('5');
  await expect(channelW).toHaveValue('5.4');
  await expect(slotW).toHaveValue('5.4');

  // The thickness drives the depth, plus the 6 mm of air above the LEDs.
  await stripT.fill('2');
  await expect(channelD).toHaveValue('8');

  // Touched by hand, the channel stops following.
  await channelW.fill('7');
  await stripW.fill('8');
  await expect(channelW).toHaveValue('7');
  await expect(stripW).toHaveValue('8');

  // Now the strip does not fit: the page says so instead of accepting it silently.
  await expect(page.locator('#preview-status')).toContainText('narrower than the LED strip', { timeout: 60_000 });

  // Reset: everything goes back to the profile values and the warning disappears.
  await page.locator('#tech-reset').click();
  await expect(stripW).toHaveValue('10');
  await expect(channelW).toHaveValue('10.4');
  await expect(page.locator('#preview-status')).not.toContainText('narrower', { timeout: 60_000 });

  expectClean(track.problems);
});
