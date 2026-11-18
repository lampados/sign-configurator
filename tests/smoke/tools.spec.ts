import { expect, test, type Page } from '@playwright/test';
import { expectClean, trackPage } from './guard';

const TOOLS = ['text', 'font', 'size', 'color', 'image', 'plate', 'tech', 'more'] as const;

async function expectNoScroll(page: Page): Promise<void> {
  const box = await page.evaluate(() => ({
    sw: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth),
    sh: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
    iw: window.innerWidth,
    ih: window.innerHeight,
  }));
  expect(box.sw).toBeLessThanOrEqual(box.iw + 1);
  expect(box.sh).toBeLessThanOrEqual(box.ih + 1);
}

for (const viewport of [
  { width: 390, height: 844, mobile: true },
  { width: 1280, height: 800, mobile: false },
] as const) {
  test(`tools at ${viewport.width}×${viewport.height}: Ciao, one sheet, size L`, async ({ page }) => {
    const track = trackPage(page);
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await page.goto('index.html', { waitUntil: 'load' });
    await expect(page.locator('input[name="text"]')).toHaveValue('Ciao');
    await expect(page.locator('#preview-status')).toContainText('LED');
    const supply = page.locator('#preview-supply');
    await expect(supply).toBeVisible();
    await expect(supply).toContainText('5 V');
    await expect(supply).toContainText(/\d+ A/);
    const corners = await page.evaluate(() => {
      const led = document.querySelector('#preview-status')!.getBoundingClientRect();
      const psu = document.querySelector('#preview-supply')!.getBoundingClientRect();
      const stage = document.querySelector('.stage-wrap')!.getBoundingClientRect();
      return { ledLeft: led.left, psuRight: psu.right, stageLeft: stage.left, stageRight: stage.right };
    });
    expect(corners.ledLeft).toBeLessThan(corners.psuRight);
    expect(corners.psuRight).toBeGreaterThan(corners.stageRight - 24);
    expect(corners.ledLeft).toBeLessThan(corners.stageLeft + 24);
    await expectNoScroll(page);

    if (viewport.mobile) {
      await expect(page.locator('.pane:visible')).toHaveCount(0);
    } else {
      // All the tools in the open, one below the other.
      await expect(page.locator('.pane:visible')).toHaveCount(TOOLS.length);
      await expect(page.locator('.section[open]')).toHaveCount(TOOLS.length);
    }

    for (const tool of TOOLS) {
      await page.locator(`[data-tool="${tool}"]`).click();
      const section = page.locator(`.section[data-section="${tool}"]`);
      await expect(section).toHaveAttribute('open', '');
      await expect(section.locator('summary')).toBeInViewport();
      await expect(page.locator(`[data-tool="${tool}"]`)).toHaveAttribute('aria-pressed', 'true');
      await expect(page.locator('.pane[data-pane="request"]')).toBeHidden();
      await expectNoScroll(page);
    }

    // A closed section reopens from the bar.
    await page.locator('.section[data-section="font"] > summary').click();
    await expect(page.locator('.section[data-section="font"]')).not.toHaveAttribute('open', '');
    await page.locator('[data-tool="font"]').click();
    await expect(page.locator('.section[data-section="font"]')).toHaveAttribute('open', '');

    await page.locator('[data-tool="size"]').click();
    await page.locator('.size-chip[data-size="180"]').click();
    await expect(page.locator('input[name="heightMm"]')).toHaveValue('180');
    await page.locator('#open-request').click();
    await expect(page.locator('#summary')).toContainText('18 cm');
    await expect(page.locator('.pane:visible')).toHaveCount(1);
    await expect(page.locator('.pane:visible')).toHaveAttribute('data-pane', 'request');
    await expectNoScroll(page);

    if (viewport.mobile) {
      await page.locator('#sheet-close').click();
      await expect(page.locator('.pane:visible')).toHaveCount(0);
      await expect(page.locator('.sheet')).toBeHidden();
      await expectNoScroll(page);
    }

    expectClean(track.problems);
  });
}

test('guided tour: six steps, the fourth highlights the Backdrop tool', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  await expect(page.locator('#preview-status')).toContainText('LED');
  await page.locator('#open-help').click();
  const card = page.locator('.tour-card');
  await expect(card.locator('.tour-count')).toHaveText('1 / 6');
  for (let i = 0; i < 3; i++) await card.locator('.tour-next').click();
  await expect(card.locator('.tour-count')).toHaveText('4 / 6');
  await expect(card.locator('.tour-title')).toHaveText('Backdrop');
  // The highlighted box sits over the Backdrop button of the bar.
  const [hole, button] = await Promise.all([page.locator('.tour-hole').boundingBox(), page.locator('[data-tool="plate"]').boundingBox()]);
  expect(hole!.x).toBeLessThanOrEqual(button!.x);
  expect(hole!.y).toBeLessThanOrEqual(button!.y);
  expect(hole!.x + hole!.width).toBeGreaterThanOrEqual(button!.x + button!.width);
  expect(hole!.y + hole!.height).toBeGreaterThanOrEqual(button!.y + button!.height);
});
