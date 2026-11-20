import { test, expect } from './helpers';

test.describe('phone layout', () => {
  test('M1 sidebar becomes a bottom tab bar and the page does not scroll sideways', async ({ page }) => {
    await page.goto('/');
    const vp = page.viewportSize();
    const nav = await page.locator('.nav').boundingBox();
    expect(nav.y).toBeGreaterThan(vp.height / 2);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(1);
    await page.locator('.nav-item').nth(2).tap();
    await expect(page.getByRole('searchbox')).toBeVisible();
  });
});
