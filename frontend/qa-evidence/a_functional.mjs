import { launch, newPage, rec, save, tab, btn, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, area, name, fn) => { try { await fn(); } catch (e) { rec(id, area, name, 'ERROR', String(e.message).split('\n')[0].slice(0, 200)); } };
const badgeOf = (p) => p.locator('text=/● (IDLE|RUNNING|PAUSED|STOPPED)/').first().textContent();
const metric = async (p, title) => +(await p.locator(`text=${title}`).locator('xpath=following-sibling::div[1]').textContent()).replace(/,/g, '');

/* ---------- CRAWLER TAB ---------- */
await safe('CR-01', 'Crawler', 'State machine', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 2);
  await p.waitForSelector('text=DARKTRACE // RECON ENGINE');
  const st = async () => ({ start: await btn(p, 'START').isEnabled(), pause: await btn(p, 'PAUSE').isEnabled(), stop: await btn(p, 'STOP').isEnabled(), reset: await btn(p, 'RESET').isEnabled() });
  const s = await st(); const badge = await badgeOf(p);
  rec('CR-01', 'Crawler', 'Initial state IDLE; only START and RESET enabled', (s.start && !s.pause && !s.stop && s.reset && badge.includes('IDLE')) ? 'PASS' : 'FAIL', JSON.stringify(s) + badge);
  const seq = []; let all = true;
  const check = async (label, exp, expBadge) => { const x = await st(); const b = await badgeOf(p); const ok = JSON.stringify(x) === JSON.stringify(exp) && b.includes(expBadge); if (!ok) all = false; seq.push(`${label}:${ok ? 'ok' : 'BAD ' + JSON.stringify(x) + b}`); };
  await btn(p, 'START').click(); await p.waitForTimeout(300); await check('start', { start: false, pause: true, stop: true, reset: true }, 'RUNNING');
  await btn(p, 'PAUSE').click(); await p.waitForTimeout(300); await check('pause', { start: true, pause: false, stop: true, reset: true }, 'PAUSED');
  await btn(p, 'START').click(); await p.waitForTimeout(300); await check('resume', { start: false, pause: true, stop: true, reset: true }, 'RUNNING');
  await btn(p, 'STOP').click(); await p.waitForTimeout(300); await check('stop', { start: true, pause: false, stop: false, reset: true }, 'STOPPED');
  await btn(p, 'RESET').click(); await p.waitForTimeout(300); await check('reset', { start: true, pause: false, stop: false, reset: true }, 'IDLE');
  rec('CR-02', 'Crawler', 'START→PAUSE→RESUME→STOP→RESET: button enablement + badge correct at every step', all ? 'PASS' : 'FAIL', seq.join(' | '));
  await p.close();
});

await safe('CR-03', 'Crawler', 'Counters/speed/logs', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 2);
  await btn(p, 'START').click();
  const read = async () => ({ crawled: await metric(p, 'PAGES CRAWLED'), disc: await metric(p, 'PAGES DISCOVERED'), prog: +(await p.locator('text=/PROGRESS \\(\\d+%\\)/').textContent()).match(/\d+/)[0] });
  const samples = [];
  for (let i = 0; i < 6; i++) { samples.push(await read()); await p.waitForTimeout(1300); }
  let mono = true; for (let i = 1; i < samples.length; i++) if (samples[i].crawled < samples[i - 1].crawled || samples[i].disc < samples[i - 1].disc) mono = false;
  const bounded = samples.every((s) => s.prog <= 100 && s.crawled <= s.disc);
  rec('CR-03', 'Crawler', 'Counters monotonic while running; crawled ≤ discovered; progress ≤ 100', mono && bounded ? 'PASS' : 'FAIL', samples.map((s) => `${s.crawled}/${s.disc}/${s.prog}%`).join(' '));
  const rate = async (s) => { await p.getByRole('button', { name: `${s}x`, exact: true }).click(); await p.waitForTimeout(200); const a = (await read()).crawled; await p.waitForTimeout(6000); const b = (await read()).crawled; return (b - a) / 6; };
  const r1 = await rate(1), r5 = await rate(5);
  rec('CR-04', 'Crawler', 'Crawl speed 5x yields materially more pages/sec than 1x', r5 > r1 * 2.5 ? 'PASS' : 'FAIL', `1x=${r1.toFixed(2)}/s 5x=${r5.toFixed(2)}/s`);
  await btn(p, 'PAUSE').click(); await p.waitForTimeout(200); await btn(p, 'START').click(); await p.waitForTimeout(300);
  const logs = await p.locator('text=/Crawler dispatched|resumed/').allTextContents();
  rec('CR-05', 'Crawler', 'Resuming from PAUSED logs a "resumed" message (not a fresh "dispatched")', logs.some((l) => /resum/i.test(l)) ? 'PASS' : 'FAIL', JSON.stringify(logs));
  for (let i = 0; i < 15; i++) { await btn(p, 'STOP').click({ timeout: 800 }).catch(() => {}); await btn(p, 'START').click({ timeout: 800 }).catch(() => {}); }
  await p.waitForTimeout(300);
  const badge = await badgeOf(p);
  rec('CR-06', 'Crawler', 'Rapid repeated STOP/START clicks (15×) leave a consistent state with no console errors', (badge.includes('RUNNING') && p.problems.length === 0) ? 'PASS' : 'FAIL', badge + ' problems=' + JSON.stringify(p.problems.slice(0, 3)));
  await p.getByRole('button', { name: 'CLEAR', exact: true }).click(); await p.waitForTimeout(200);
  const logCount = await p.locator('text=/\\[(SCAN|OK|EXTRACT|INDEX|WARN|ALERT)\\]/').count();
  rec('CR-07', 'Crawler', 'CLEAR empties the activity log', logCount <= 2 ? 'PASS' : 'FAIL', `log rows right after clear=${logCount}`);
  await btn(p, 'RESET').click(); await p.waitForTimeout(300);
  const after = await read(); const b2 = await badgeOf(p);
  rec('CR-08', 'Crawler', 'RESET while running → IDLE, 0 crawled, 0%', (after.crawled === 0 && after.prog === 0 && b2.includes('IDLE')) ? 'PASS' : 'FAIL', JSON.stringify(after) + b2);
  await p.close();
});

await safe('CR-09', 'Crawler', 'No URL input / error state', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 2); await p.waitForSelector('text=PAGES CRAWLED');
  const inputs = await p.locator('main input, main textarea').count();
  rec('CR-09', 'Crawler', 'URL input present (instructions: "URL validation")', inputs > 0 ? 'PASS' : 'FAIL', `inputs on Crawler page=${inputs}; target URL is read-only text`);
  rec('CR-10', 'Crawler', 'Error state representable (instructions: "running, paused, stopped and error states")', 'FAIL', 'Static review: BADGES map has only running/paused/stopped/idle; no code path sets an error status');
  await p.close();
});

await safe('CR-11', 'Integration', 'Crawler persists across tabs', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 2); await btn(p, 'START').click(); await p.waitForTimeout(1500);
  const c1 = await metric(p, 'PAGES CRAWLED');
  await tab(p, 1); await p.waitForTimeout(500);
  const chip = await p.locator('.hero-chips span').filter({ hasText: 'crawler' }).textContent();
  await tab(p, 3); await p.waitForTimeout(500); await tab(p, 2); await p.waitForTimeout(300);
  const badge = await badgeOf(p); const c2 = await metric(p, 'PAGES CRAWLED');
  rec('CR-11', 'Integration', 'Crawler keeps running & counters grow across tab switches; hero chip shows LIVE', (/LIVE/.test(chip) && badge.includes('RUNNING') && c2 > c1) ? 'PASS' : 'FAIL', `chip="${chip}" badge="${badge}" crawled ${c1}->${c2}`);
  await p.close();
});

/* ---------- THREAT INTELLIGENCE ---------- */
const cardsOf = (p) => p.locator('.threat-card');
const sel = (p, label) => p.getByLabel(label);
const rows = (p) => p.$$eval('.threat-card', (els) => els.map((e) => ({ name: e.querySelector('h3').textContent, sev: e.querySelector('.badge').textContent.trim(), type: e.querySelector('small').textContent.replace(' IOC', ''), src: e.querySelectorAll('.threat-data span')[0].textContent, ago: e.querySelectorAll('.threat-data span')[1]?.textContent })));

await safe('TI-01', 'Threat Intel', 'Search', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 3); await p.waitForSelector('.threat-card');
  const box = p.getByRole('searchbox');
  const countFor = async (q) => { await box.fill(q); await p.waitForTimeout(100); return cardsOf(p).count(); };
  const firstName = await cardsOf(p).first().locator('h3').textContent();
  const firstSrc = await cardsOf(p).first().locator('.threat-data span').first().textContent();
  const firstIoc = await cardsOf(p).first().locator('code').textContent();
  const r = {};
  r.name = await countFor(firstName.toUpperCase()); r.src = await countFor(firstSrc.toLowerCase());
  r.ioc = await countFor(firstIoc); r.iocPartial = await countFor(firstIoc.slice(0, 6));
  r.type = await countFor('hash'); r.status = await countFor('investigating');
  r.padded = await countFor('   ' + firstIoc + '  '); r.none = await countFor('zzzz-no-such-thing');
  const emptyTxt = await p.locator('.empty-state h3').textContent().catch(() => 'none');
  r.regex = await countFor('('); r.regex2 = await countFor('[a-z]+.*'); r.long = await countFor('A'.repeat(5000));
  r.sev = await countFor('critical');
  rec('TI-01', 'Threat Intel', 'Search matches name/source/IOC (full+partial)/type/status, case-insens., trims; regex chars and 5000-char input handled', (r.name >= 1 && r.src >= 1 && r.ioc >= 1 && r.iocPartial >= 1 && r.type >= 1 && r.status >= 1 && r.padded >= 1 && r.none === 0 && r.regex === 0 && r.long === 0 && p.problems.length === 0) ? 'PASS' : 'FAIL', JSON.stringify(r) + ' empty="' + emptyTxt + '" problems=' + p.problems.length);
  rec('TI-02', 'Threat Intel', 'Searching a severity word ("critical") returns matches', r.sev > 0 ? 'PASS' : 'FAIL', `results=${r.sev}; haystack = name+IOC+source+type+status (placeholder: "threat, IOC or source")`);
  await p.close();
});

await safe('TI-03', 'Threat Intel', 'Filters and sorting', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 3); await p.waitForSelector('.threat-card');
  const all = await rows(p); const bad = [];
  for (const s of ['Critical', 'High', 'Medium', 'Low']) { await sel(p, 'Filter by severity').selectOption(s); const r = await rows(p); if (!r.length || r.some((x) => x.sev !== s)) bad.push('sev ' + s + ' n=' + r.length); const lab = (await p.locator('.feed-heading > span').textContent()).trim(); if (lab !== `${r.length} results`) bad.push('label ' + lab + ' vs ' + r.length); }
  await sel(p, 'Filter by severity').selectOption('All');
  for (const t of ['IP', 'Domain', 'Hash', 'URL', 'Email']) { await sel(p, 'Filter by IOC type').selectOption(t); const r = await rows(p); if (r.some((x) => x.type !== t)) bad.push('type ' + t); if (!r.length) bad.push('type ' + t + ' has 0 results (data)'); }
  await sel(p, 'Filter by IOC type').selectOption('All');
  const srcOpts = await sel(p, 'Filter by source').locator('option').allTextContents();
  for (const o of srcOpts.slice(1)) { const name = o.replace('Source: ', ''); await sel(p, 'Filter by source').selectOption({ label: o }); const r = await rows(p); if (!r.length || r.some((x) => x.src !== name)) bad.push('source ' + name); }
  await sel(p, 'Filter by source').selectOption('All');
  rec('TI-03', 'Threat Intel', 'Each severity/type/source filter returns only matching cards; "N results" label correct', bad.length ? 'FAIL' : 'PASS', bad.join('; ') || `${all.length} threats, ${srcOpts.length - 1} sources`);
  await sel(p, 'Filter by severity').selectOption('High'); await sel(p, 'Filter by IOC type').selectOption('Domain');
  const comb = await rows(p); const expected = all.filter((x) => x.sev === 'High' && x.type === 'Domain').length;
  rec('TI-04', 'Threat Intel', 'Combined severity+type filter equals the intersection', comb.length === expected ? 'PASS' : 'FAIL', `ui=${comb.length} expected=${expected}`);
  await p.getByRole('searchbox').fill('zzz'); await p.waitForTimeout(100);
  const empty = await p.locator('.empty-state').count();
  await p.getByRole('button', { name: 'Clear filters' }).click(); await p.waitForTimeout(150);
  const restored = (await rows(p)).length; const vals = [await sel(p, 'Filter by severity').inputValue(), await sel(p, 'Filter by IOC type').inputValue(), await p.getByRole('searchbox').inputValue()];
  rec('TI-05', 'Threat Intel', 'Combined filters + no match → empty state; "Clear filters" restores all', (empty === 1 && restored >= all.length && vals.join() === 'All,All,') ? 'PASS' : 'FAIL', `empty=${empty} restored=${restored}/${all.length} vals=${vals}`);
  await p.getByRole('button', { name: 'Reset' }).click();
  await sel(p, 'Sort threats').selectOption('Highest severity'); const hs = await rows(p); const ord = { Critical: 4, High: 3, Medium: 2, Low: 1 };
  rec('TI-06', 'Threat Intel', 'Sort "Highest severity" is non-increasing', hs.every((x, i) => i === 0 || ord[hs[i - 1].sev] >= ord[x.sev]) ? 'PASS' : 'FAIL', `first=${hs[0]?.sev} last=${hs.at(-1)?.sev}`);
  const parseAgo = (s) => { const m = /(\d+)\s*(min|h|d|sec|s)/.exec(s || ''); if (!m) return 0; const n = +m[1]; return m[2].startsWith('min') ? n * 60 : m[2] === 'h' ? n * 3600 : m[2] === 'd' ? n * 86400 : n; };
  let tieOK = true; for (let i = 1; i < hs.length; i++) if (hs[i].sev === hs[i - 1].sev && parseAgo(hs[i].ago) < parseAgo(hs[i - 1].ago)) tieOK = false;
  rec('TI-07', 'Threat Intel', 'Under "Highest severity", equal-severity cards keep newest-first order', tieOK ? 'PASS' : 'FAIL', 'compared relative-time labels');
  await sel(p, 'Sort threats').selectOption('Oldest'); const old = await rows(p); await sel(p, 'Sort threats').selectOption('Newest'); const nw = await rows(p);
  const okOld = old.every((x, i) => i === 0 || parseAgo(old[i - 1].ago) >= parseAgo(x.ago)); const okNew = nw.every((x, i) => i === 0 || parseAgo(nw[i - 1].ago) <= parseAgo(x.ago));
  rec('TI-08', 'Threat Intel', 'Sort Oldest / Newest order by detection time', okOld && okNew ? 'PASS' : 'FAIL', `oldestFirst=${okOld} newestFirst=${okNew}`);
  await p.close();
});

await safe('TI-09', 'Threat Intel', 'Modal / copy / review', async () => {
  const p = await newPage(browser, { permissions: ['clipboard-read', 'clipboard-write'] });
  await p.goto(BASE); await tab(p, 3); await p.waitForSelector('.threat-card');
  const card = cardsOf(p).first(); const name = await card.locator('h3').textContent(); const ioc = await card.locator('code').textContent();
  await card.click(); const dlg = p.getByRole('dialog'); await dlg.waitFor();
  const title = await dlg.getByRole('heading').first().textContent(); const detailIoc = await dlg.locator('code').textContent();
  await dlg.getByRole('button', { name: 'COPY' }).click(); await p.waitForTimeout(200);
  const clip = await p.evaluate(() => navigator.clipboard.readText()); const copiedLabel = await dlg.locator('.ioc-copy-row button').textContent();
  rec('TI-09', 'Threat Intel', 'Details modal shows same name/IOC; COPY puts exact IOC on clipboard; label COPIED', (title === name && detailIoc === ioc && clip === ioc && copiedLabel === 'COPIED') ? 'PASS' : 'FAIL', `title=${title === name} ioc=${detailIoc === ioc} clipboard=${clip === ioc} label=${copiedLabel}`);
  await p.waitForTimeout(1600); const lab2 = await dlg.locator('.ioc-copy-row button').textContent();
  rec('TI-10', 'Threat Intel', 'COPIED label reverts to COPY after ~1.4 s', lab2 === 'COPY' ? 'PASS' : 'FAIL', lab2);
  const before = await dlg.locator('.status-badge').textContent();
  await dlg.getByRole('button', { name: 'Mark as Reviewed' }).click(); await p.waitForTimeout(150);
  const after = await dlg.locator('.status-badge').textContent(); const disabled = await dlg.getByRole('button', { name: 'Reviewed' }).isDisabled();
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.getByRole('searchbox').fill('reviewed'); await p.waitForTimeout(150);
  const hits = await cardsOf(p).count(); const hitName = hits ? await cardsOf(p).first().locator('h3').textContent() : '';
  rec('TI-11', 'Threat Intel', 'Mark as Reviewed: badge flips, button disabled, status searchable & persistent', (before !== 'Reviewed' && after === 'Reviewed' && disabled && hits >= 1 && hitName === name) ? 'PASS' : 'FAIL', `before=${before} after=${after} disabled=${disabled} hits=${hits}`);
  await p.getByRole('searchbox').fill(''); await cardsOf(p).first().focus(); await cardsOf(p).first().press('Enter'); await dlg.waitFor();
  const lock = await p.evaluate(() => document.body.style.overflow);
  await p.mouse.click(5, 450); await p.waitForTimeout(250);
  const closed = (await dlg.count()) === 0; const lockAfter = await p.evaluate(() => document.body.style.overflow); const focusBack = await p.evaluate(() => document.activeElement?.className || '');
  rec('TI-12', 'Threat Intel', 'Modal: Enter opens, backdrop click closes, scroll lock released, focus returns to the card', (closed && lock === 'hidden' && lockAfter !== 'hidden' && /threat-card/.test(focusBack)) ? 'PASS' : 'FAIL', `closed=${closed} lock=${lock}->${lockAfter} focus=${focusBack}`);
  await p.close();
});

await safe('TI-13', 'Threat Intel', 'Clipboard failure', async () => {
  const p = await newPage(browser);
  await p.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await p.goto(BASE); await tab(p, 3); await p.waitForSelector('.threat-card'); await cardsOf(p).first().click();
  const dlg = p.getByRole('dialog'); await dlg.getByRole('button', { name: 'COPY' }).click(); await p.waitForTimeout(300);
  const lab = await dlg.locator('.ioc-copy-row button').textContent(); const toast = await p.locator('.dt-toast, [role="alert"]').count();
  rec('TI-13', 'Threat Intel', 'When clipboard write is denied/unavailable the user gets visible feedback', (lab !== 'COPY' || toast > 0) ? 'PASS' : 'FAIL', `label after failure="${lab}", toasts=${toast}`);
  await p.close();
});

await safe('TI-14', 'Integration', 'Filter state persistence', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 3); await p.waitForSelector('.threat-card');
  await p.getByRole('searchbox').fill('tor'); await sel(p, 'Filter by severity').selectOption('High'); await sel(p, 'Sort threats').selectOption('Oldest');
  await tab(p, 1); await p.waitForTimeout(300); await tab(p, 3); await p.waitForSelector('.threat-page');
  const v = [await p.getByRole('searchbox').inputValue(), await sel(p, 'Filter by severity').inputValue(), await sel(p, 'Sort threats').inputValue()];
  rec('TI-14', 'Integration', 'Search/severity/sort retained after leaving and returning to Threat Intelligence', (v[0] === 'tor' && v[1] === 'High' && v[2] === 'Oldest') ? 'PASS' : 'FAIL', `after return: search="${v[0]}" severity=${v[1]} sort=${v[2]}`);
  await p.close();
});

await safe('TI-15', 'Threat Intel', 'Live threats while crawling', async () => {
  const p = await newPage(browser); await p.goto(BASE); await tab(p, 3); await p.waitForSelector('.threat-card');
  const n0 = await cardsOf(p).count(); const tot0 = +(await p.locator('.stat-card.total strong').textContent());
  await tab(p, 2); await btn(p, 'START').click(); await tab(p, 3);
  await p.waitForTimeout(16000);
  const n1 = await cardsOf(p).count(); const tot1 = +(await p.locator('.stat-card.total strong').textContent());
  const sumCards = (await Promise.all(['critical', 'high', 'medium', 'low'].map(async (k) => +(await p.locator(`.stat-card.${k} strong`).textContent())))).reduce((a, b) => a + b, 0);
  rec('TI-15', 'Threat Intel', 'After 16 s of crawling new threats appear; header total = Σ severity cards', (n1 > n0 && tot1 > tot0 && tot1 === sumCards) ? 'PASS' : 'FAIL', `cards ${n0}->${n1}; total ${tot0}->${tot1}; Σsev=${sumCards}`);
  await p.close();
});

save('a_functional');
await browser.close();
console.log('DONE A');
