import { expect, test } from '@playwright/test';
import { expectClean, trackPage } from './guard';

test('Tech: pointing at a parameter highlights its element in the preview', async ({ page }) => {
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await page.locator('[data-tool="tech"]').click();
  const stage = page.locator('#stage');

  // Mouse over a field: the preview points at its element, and lets go when the mouse leaves.
  const channelW = page.locator('input[name="tech-CHANNEL_W"]');
  await channelW.scrollIntoViewIfNeeded();
  await channelW.hover();
  await expect(stage).toHaveAttribute('data-focus', 'channelWidth');
  await page.locator('input[name="tech-CHANNEL_DEPTH"]').hover();
  await expect(stage).toHaveAttribute('data-focus', 'channelDepth');
  await page.locator('input[name="tech-FLOOR"]').hover();
  await expect(stage).toHaveAttribute('data-focus', 'floor');
  await page.locator('input[name="tech-PATH_HOLE_D"]').hover();
  await expect(stage).toHaveAttribute('data-focus', 'pathHoles');
  await page.mouse.move(300, 300);
  await expect(stage).toHaveAttribute('data-focus', '');

  // Focus in a field does the same (a tap, on a phone).
  await page.locator('input[name="wallMm"]').focus();
  await expect(stage).toHaveAttribute('data-focus', 'housing');

  // The "LED strip" group points at nothing.
  await page.locator('input[name="tech-STRIP_W"]').focus();
  await expect(stage).toHaveAttribute('data-focus', '');
  await page.locator('select[name="tech-STRIP_V"]').hover();
  await expect(stage).toHaveAttribute('data-focus', '');

  // With the round end hole the fields of the old slot are hidden; they come back with the hole at 0.
  const slotW = page.locator('input[name="tech-WIRE_SLOT_W"]');
  const lip = page.locator('input[name="tech-SLOT_LIP_CHAMFER"]');
  await expect(slotW).toBeHidden();
  await expect(lip).toBeHidden();
  await expect(page.locator('input[name="tech-WIRE_SLOT_L"]')).toBeVisible();
  await page.locator('input[name="tech-WIRE_HOLE_D"]').fill('0');
  await expect(slotW).toBeVisible();
  await expect(lip).toBeVisible();

  expectClean(track.problems);
});
