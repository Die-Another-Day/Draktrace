import { chromium } from '/home/claude/work/Task3/Integrated-Without-Spider/node_modules/@playwright/test/index.mjs';
import fs from 'fs';
export const BASE = 'http://localhost:4173';
export const results = [];
export const rec = (id, area, name, result, detail = '') => { results.push({ id, area, name, result, detail }); console.log(`${result.padEnd(5)} ${id} ${name} ${detail ? '— ' + detail : ''}`); };
export async function launch() {
  return chromium.launch({ executablePath: '/tmp/chromium', args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist', '--disable-background-networking', '--no-sandbox'] });
}
export async function newPage(browser, opts = {}) {
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, ...opts });
  const page = await ctx.newPage();
  page.problems = [];
  page.on('pageerror', (e) => page.problems.push('pageerror: ' + e.message));
  page.on('console', (m) => { if (['error', 'warning'].includes(m.type())) page.problems.push(`console.${m.type()}: ${m.text()}`); });
  page.on('response', (r) => { if (r.status() >= 400) page.problems.push(`http ${r.status()}: ${r.url()}`); });
  page.on('requestfailed', (r) => page.problems.push(`requestfailed: ${r.url()} ${r.failure()?.errorText}`));
  page.on('request', (r) => { const u = r.url(); if (!u.startsWith(BASE) && !u.startsWith('data:') && !u.startsWith('blob:')) page.problems.push('external request: ' + u); });
  await page.addInitScript(() => { try { sessionStorage.setItem('dt-booted', '1'); } catch {} });
  return page;
}
export const save = (name) => fs.writeFileSync(`/home/claude/work/qa/${name}.json`, JSON.stringify(results, null, 2));
export const tab = (page, n) => page.locator('.nav-item').nth(n - 1).click();
export const btn = (page, name) => page.getByRole('button', { name, exact: true });
