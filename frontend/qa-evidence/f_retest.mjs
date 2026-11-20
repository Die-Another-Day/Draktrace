import { launch, newPage, rec, save, btn, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, fn) => { try { await fn(); } catch (e) { rec(id, '-', '-', 'ERROR', String(e.message).split('\n')[0].slice(0, 220)); } };
const go = (p, n) => p.locator('.nav-item').nth(n - 1).click({ timeout: 120000 }).then(() => p.waitForTimeout(500));
await safe('TI-14', async () => {
  const p = await newPage(browser); await p.goto(BASE); await go(p, 3); await p.waitForSelector('.threat-card');
  await p.getByRole('searchbox').fill('tor'); await p.getByLabel('Filter by severity').selectOption('High'); await p.getByLabel('Sort threats').selectOption('Oldest');
  await go(p, 1); await go(p, 3); await p.waitForSelector('.threat-page');
  const v = [await p.getByRole('searchbox').inputValue(), await p.getByLabel('Filter by severity').inputValue(), await p.getByLabel('Sort threats').inputValue()];
  const shown = await p.locator('.feed-heading > span').textContent();
  rec('TI-14', 'Integration', 'RETEST filters persist across tab switch', (v[0] === 'tor' && v[1] === 'High' && v[2] === 'Oldest') ? 'PASS' : 'FAIL', `${v} ${shown}`);
  await p.getByRole('button', { name: /Clear filters|Reset/ }).first().click().catch(() => {});
  await p.reload(); await go(p, 3); await p.waitForSelector('.threat-card');
  rec('TI-14b', 'Integration', 'RETEST after full page reload filters start clean', (await p.getByRole('searchbox').inputValue()) === '' ? 'PASS' : 'FAIL', '');
  // TI-02
  await p.getByRole('searchbox').fill('critical'); await p.waitForTimeout(150); const n = await p.locator('.threat-card').count();
  const sevs = await p.$$eval('.threat-card .badge', (e) => [...new Set(e.map((x) => x.textContent.trim()))]);
  rec('TI-02', 'Threat Intel', 'RETEST search "critical" returns only Critical threats', n > 0 && sevs.length === 1 && sevs[0] === 'Critical' ? 'PASS' : 'FAIL', `n=${n} sev=${sevs}`);
  await p.close();
});
await safe('TI-13', async () => {
  const p = await newPage(browser);
  await p.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await p.goto(BASE); await go(p, 3); await p.waitForSelector('.threat-card'); await p.locator('.threat-card').first().click();
  const dlg = p.getByRole('dialog'); await dlg.getByRole('button', { name: 'COPY' }).click(); await p.waitForTimeout(250);
  const l1 = await dlg.locator('.ioc-copy-row button').textContent(); await p.waitForTimeout(2500); const l2 = await dlg.locator('.ioc-copy-row button').textContent();
  rec('TI-13', 'Threat Intel', 'RETEST clipboard denied shows COPY FAILED then reverts', l1 === 'COPY FAILED' && l2 === 'COPY' ? 'PASS' : 'FAIL', `${l1} -> ${l2}`);
  await p.close();
});
await safe('TI-12', async () => {
  const p = await newPage(browser); await p.goto(BASE); await go(p, 3); await p.waitForSelector('.threat-card');
  await p.locator('.threat-card').first().focus(); await p.keyboard.press('Enter'); await p.getByRole('dialog').waitFor();
  await p.mouse.click(5, 450); await p.waitForTimeout(400);
  const f = await p.evaluate(() => document.activeElement?.className || '');
  const lock = await p.evaluate(() => document.body.style.overflow);
  rec('TI-12', 'Threat Intel', 'RETEST backdrop click closes and focus returns to card; scroll lock released', /threat-card/.test(f) && lock !== 'hidden' ? 'PASS' : 'FAIL', `focus=${f} overflow="${lock}"`);
  await p.close();
});
await safe('CR-05', async () => {
  const p = await newPage(browser); await p.goto(BASE); await go(p, 2);
  await btn(p, 'START').click(); await btn(p, 'PAUSE').click(); await btn(p, 'START').click(); await p.waitForTimeout(300);
  const logs = await p.locator('text=/Crawler dispatched|Crawler resumed/').allTextContents();
  rec('CR-05', 'Crawler', 'RETEST resume logs "resumed", first start logs "dispatched"', logs.some((l) => /resumed/.test(l)) && logs.some((l) => /dispatched/.test(l)) ? 'PASS' : 'FAIL', JSON.stringify(logs));
  await go(p, 1); const ev = await p.locator('text=/resumed/').count();
  rec('CR-05b', 'Command Center', 'RETEST Command Center feed shows "resumed" event', ev > 0 ? 'PASS' : 'FAIL', `matches=${ev}`);
  await p.close();
});
await safe('ST-01', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-head');
  const idle = [await p.locator('.live-pill').innerText(), (await p.locator('.cc-head__right').innerText()).split('\n')[0]];
  await go(p, 3); const tiIdle = await p.locator('.live-status').innerText();
  rec('ST-01a', 'Status', 'RETEST all-idle: top bar / Command Center / Threat Intel do not claim LIVE', idle.every((x) => !/LIVE/.test(x)) && !/LIVE/.test(tiIdle) ? 'PASS' : 'FAIL', `${idle} | TI=${tiIdle}`);
  await go(p, 1); await p.getByRole('button', { name: 'Simulate activity' }).click(); await p.waitForTimeout(400);
  const run = [await p.locator('.live-pill').innerText(), (await p.locator('.cc-head__right').innerText()).split('\n')[0]]; await go(p, 3); const tiRun = await p.locator('.live-status').innerText();
  rec('ST-01b', 'Status', 'RETEST running: all three show LIVE', run.every((x) => /LIVE/.test(x)) && /LIVE/.test(tiRun) ? 'PASS' : 'FAIL', `${run} | TI=${tiRun}`);
  await go(p, 1); await p.getByRole('button', { name: 'Pause feed' }).click(); const paused = (await p.locator('.cc-head__right').innerText()).split('\n')[0];
  await p.getByRole('button', { name: 'Stop activity' }).click(); await p.waitForTimeout(300); await p.getByRole('button', { name: 'Resume feed' }).click(); const standby = (await p.locator('.cc-head__right').innerText()).split('\n')[0]; const top = await p.locator('.live-pill').innerText();
  rec('ST-01c', 'Status', 'RETEST feed paused → PAUSED; fleet stopped + feed on → STANDBY; top bar STOPPED', paused === 'PAUSED' && standby === 'STANDBY' && /STOPPED/.test(top) ? 'PASS' : 'FAIL', `${paused} / ${standby} / ${top}`);
  rec('ST-01d', 'Status', 'RETEST no console errors during status tour', p.problems.length === 0 ? 'PASS' : 'FAIL', JSON.stringify(p.problems.slice(0, 3)));
  await p.close();
});
save('f_retest'); await browser.close(); console.log('DONE F');
