import { launch, newPage, rec, save, BASE } from './lib.mjs';
const browser = await launch();
try {
  const p = await newPage(browser); await p.goto(BASE); await p.locator('.nav-item').nth(2).click({ timeout: 120000 }); await p.waitForSelector('.threat-card', { timeout: 120000 });
  rec('TI-14b', 'Integration', 'RETEST fresh page load starts with empty search', (await p.getByRole('searchbox').inputValue()) === '' ? 'PASS' : 'FAIL', '');
  await p.getByRole('searchbox').fill('critical'); await p.waitForTimeout(200);
  const n = await p.locator('.threat-card').count(); const sevs = await p.$$eval('.threat-card .badge', (e) => [...new Set(e.map((x) => x.textContent.trim()))]);
  rec('TI-02', 'Threat Intel', 'RETEST search "critical" returns only Critical threats', n > 0 && sevs.length === 1 && sevs[0] === 'Critical' ? 'PASS' : 'FAIL', `n=${n} sev=${sevs}`);
  await p.getByRole('searchbox').fill('high'); await p.waitForTimeout(200); const h = await p.locator('.threat-card').count();
  rec('TI-02b', 'Threat Intel', 'RETEST search "high" returns results (and no crash)', h > 0 ? 'PASS' : 'FAIL', `n=${h}`);
} catch (e) { rec('G', '-', '-', 'ERROR', String(e.message).split('\n')[0]); }
save('g_retest'); await browser.close(); console.log('DONE G');
