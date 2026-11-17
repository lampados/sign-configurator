import { expect, test } from '@playwright/test';
import { expectClean, trackPage } from './guard';

const NEW_FONTS = ['beon', 'pecita', 'compagnon-italic', 'primer-print', 'wire-one', 'comfortaa'];

test('font: le miniature usano il proprio font e i nuovi generano un\'insegna', async ({ page }) => {
  test.setTimeout(240_000);
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  const status = page.locator('#preview-status');
  await expect(status).toContainText('LED');
  await page.locator('[data-tool="font"]').click();

  for (const id of NEW_FONTS) {
    const card = page.locator(`.font-card[data-font="${id}"]`);
    // Il file è arrivato e la miniatura lo usa: senza, uscirebbe il font di sistema.
    await expect.poll(() => page.evaluate((family) => document.fonts.check(`20px "${family}"`), id)).toBe(true);
    const family = await card.locator('.font-sample').evaluate((el) => getComputedStyle(el).fontFamily);
    expect(family).toContain(id);

    const before = await status.getAttribute('data-generation');
    await card.click();
    await expect(card).toHaveAttribute('aria-pressed', 'true');
    await expect.poll(async () => status.getAttribute('data-generation'), { timeout: 60_000 }).not.toBe(before);
    await expect(status).toContainText('LED');
  }
  expectClean(track.problems);
});

test('cirillico: un font che non ha le lettere lo dice, Comfortaa le disegna', async ({ page }) => {
  test.setTimeout(240_000);
  const track = trackPage(page);
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('index.html', { waitUntil: 'load' });
  const status = page.locator('#preview-status');
  await expect(status).toContainText('LED');

  // Sacramento non ha il cirillico: né pagina vuota né «Could not build», ma l'invito a cambiare font.
  await page.locator('input[name="text"]').fill('Привет');
  await expect(status).toContainText('none of these letters');

  await page.locator('[data-tool="font"]').click();
  const card = page.locator('.font-card[data-font="comfortaa"]');
  // La miniatura resta il campione cirillico, non il testo digitato.
  await expect(card.locator('.font-sample')).toHaveText('Привет');
  await card.click();
  await expect(status).toContainText('LED');
  await expect(status).not.toContainText('letters');

  // Lettere miste in un font solo latino: l'insegna esce con quelle che ci sono, e lo dice.
  await page.locator('.font-card[data-font="beon"]').click();
  await page.locator('input[name="text"]').fill('Ciao Привет');
  await expect(status).toContainText('lacks some of these letters');
  expectClean(track.problems);
});
