import { expect, test } from '@playwright/test';

test('load, unlock audio, move, toggle a layer, ask both questions', async ({ page }) => {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));

  await page.goto('/');
  await page.getByRole('button', { name: /press any key to begin/i }).click();
  const caption = page.locator('.caption');
  await expect(caption).toContainText('Feel the Earth.', { timeout: 30_000 });

  await page.keyboard.press('ArrowRight'); // quarter of 10 degrees east
  await expect(page.locator('.coords')).toContainText('83.20° E'); // the glide lands exactly
  await page.keyboard.press('KeyW');
  await expect(caption).toContainText('Window centre 7.9 north, 83.2 east');
  await expect(caption).toContainText('Date:');

  await page.keyboard.press('Digit2');
  await expect(caption).toContainText('Wind speed on, the flute and the wind.');
  await expect(page.getByRole('button', { name: /^2 Wind$/ })).toHaveAttribute('aria-pressed', 'true');

  await page.keyboard.press('KeyH');
  await expect(caption).toContainText('Demo data, not NASA data.');
  await expect(caption).toContainText('Surface air temperature');
  await expect(caption).toContainText('You hear it as the flute and the wind.');

  await page.getByRole('button', { name: /Where am I/ }).click();
  await expect(caption).toContainText('Window centre');

  expect(errors).toEqual([]);
});
