import { test as base, expect } from '@playwright/test';

// Every test starts with the boot screen skipped and fails on console errors, page errors or any request that leaves localhost.
export const test = base.extend({
  // console errors a test expects (matched as substrings), e.g. an effect complaining when a browser API is blocked on purpose
  allowErrors: [[], { option: true }],
  page: async ({ page, baseURL, allowErrors }, use) => {
    const problems = [];
    page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
    page.on('console', (m) => { if (m.type() === 'error') problems.push(`console.error: ${m.text()}`); });
    page.on('response', (r) => { if (r.status() >= 400) problems.push(`http ${r.status()}: ${r.url()}`); });
    page.on('request', (r) => { if (!r.url().startsWith(baseURL) && !r.url().startsWith('data:') && !r.url().startsWith('blob:')) problems.push(`external request: ${r.url()}`); });
    await page.addInitScript(() => { try { sessionStorage.setItem('dt-booted', '1'); } catch { /* ignore */ } });
    await use(page);
    expect(problems.filter((p) => !allowErrors.some((a) => p.includes(a))), 'errors or external requests during the test').toEqual([]);
  },
});
export { expect };

export const heroChip = (page) => page.locator('.hero-chips span').filter({ hasText: 'crawler' });
export const crawlerBadge = (page) => page.getByRole('button', { name: 'START' }).locator('xpath=preceding-sibling::div[1]');
