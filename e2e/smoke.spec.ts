import { expect, test } from '@playwright/test';

test('load, unlock audio, move, toggle a layer, ask both questions, time travel', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('button', { name: /press any key to begin/i }).click();
  const caption = page.locator('.caption');
  await expect(caption).toContainText('Feel the Earth.', { timeout: 30_000 });
  await expect(caption).not.toContainText('DEMO DATA'); // real NASA EIC layers loaded

  await page.keyboard.press('ArrowRight'); // quarter of 10 degrees east
  await expect(page.locator('.coords')).toContainText(/83\.2\d° E/); // a tap glides a quarter width
  await page.keyboard.press('KeyW');
  await expect(caption).toContainText('Window centre 7.9 north, 83.2 east');
  await expect(caption).toContainText('Date: 14 November 2007.');

  await page.keyboard.press('Digit2');
  await expect(caption).toContainText('Lightning on, the glockenspiel and the rain.');
  await expect(caption).toContainText('so the date moved to 1 March 2017');

  await page.keyboard.press('KeyM');
  await expect(page.getByRole('button', { name: /^2 Lightning/ })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('slider', { name: 'Date' })).toBeAttached();

  await page.keyboard.press('KeyH');
  await expect(caption).toContainText('Lightning,');
  await expect(caption).toContainText('Sea surface temperature: no data in this window.');

  await page.keyboard.press('KeyY');
  await expect(caption).toContainText('Time travel on: a day per bar.');

  expect(errors).toEqual([]);
});
