import { launch, newPage, rec, save, BASE } from './lib.mjs';
import fs from 'fs';
const browser = await launch();
const safe = async (id, fn) => { try { await fn(); } catch (e) { rec(id, 'PDF', '-', 'ERROR', String(e.message).split('\n')[0].slice(0, 220)); } };
const go = (p, n) => p.locator('.nav-item').nth(n - 1).click({ timeout: 120000 }).then(() => p.waitForTimeout(1500));

await safe('GL-B3c', async () => {
  const p = await newPage(browser, { reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForSelector('.sidebar', { timeout: 120000 });
  const out = [];
  for (const [w, h] of [[375, 812], [768, 1024], [1440, 900]]) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(800);
    out.push(w + ':' + await p.evaluate(() => { const g = (s) => { const c = getComputedStyle(document.querySelector(s)).backgroundColor.match(/rgba?\(([^)]+)\)/)[1].split(',').map(parseFloat); return c.length === 4 ? c[3] : 1; }; return `sidebar=${g('.sidebar')} topbar=${g('.topbar')} ticker=${g('.ticker')}`; }));
  }
  rec('GL-B3c', 'Layout', 'PDF Bug 3: phone bottom bar (.sidebar ≤760px), top bar and ticker are fully opaque', out[0].includes('sidebar=1 ') && out.every((o) => /topbar=1 ticker=1/.test(o)) ? 'PASS' : 'FAIL', out.join(' | '));
  await p.close();
});

await safe('P3-01', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev', { timeout: 120000 }); await p.waitForTimeout(2500);
  // BUG-01 bars drawn
  const bars = await p.$$eval('.cc-bars__bar', (e) => e.map((x) => Math.round(x.getBoundingClientRect().height)));
  rec('P3-BUG01', 'CommandCenter', 'Saksham BUG-01: Crawling-activity bars are drawn with non-zero height', bars.length === 7 && bars.every((h) => h > 10) ? 'PASS' : 'FAIL', `bar heights px=${JSON.stringify(bars)}`);
  // BUG-03 timestamps
  const times = await p.$$eval('.cc-span-3 [class*="log"] [class*="time"], .cc-span-3 time, .cc-span-3 .dt-log__time', (e) => e.map((x) => x.textContent.trim()));
  rec('P3-BUG03', 'CommandCenter', 'Saksham BUG-03: initial feed lines carry their own (distinct) timestamps, not all the page-load time', new Set(times).size > 1 ? 'PASS' : 'FAIL', `${times.length} lines, ${new Set(times).size} distinct: ${JSON.stringify(times.slice(0, 8))}`);
  // BUG-04 critical/low filter on load
  const res = {};
  for (const k of ['critical', 'high', 'medium', 'low']) { await p.locator('.cc-chip', { hasText: k }).click(); await p.waitForTimeout(250); res[k] = await p.locator('.cc-span-3').innerText().then((t) => (/No events match/i.test(t) ? 0 : 1)); }
  await p.locator('.cc-chip', { hasText: 'all' }).click();
  rec('P3-BUG04', 'CommandCenter', 'Saksham BUG-04: every severity filter (incl. Critical and Low) shows events on load', Object.values(res).every(Boolean) ? 'PASS' : 'FAIL', JSON.stringify(res));
  // BUG-08 chip toggles off
  await p.locator('.cc-chip', { hasText: 'high' }).click(); await p.locator('.cc-chip', { hasText: 'high' }).click(); await p.waitForTimeout(150);
  const on = await p.locator('.cc-chip.is-on').textContent(); await p.locator('.cc-chip', { hasText: 'all' }).click();
  rec('P3-BUG08', 'CommandCenter', 'Saksham BUG-08: clicking a selected severity chip a second time clears the filter (like cards/legend)', on === 'all' ? 'PASS' : 'FAIL', `after two clicks on "high": ${on}`);
  // BUG-12 data consistency crawler progress vs pages
  const c = JSON.parse(fs.readFileSync('/home/claude/work/Task3/Integrated-Without-Spider/src/mock-data/crawlers.json', 'utf8'));
  const arr = Array.isArray(c) ? c : c.crawlers || Object.values(c);
  const rows = arr.map((x) => `${x.name}:${x.status}:${x.progress}%vs${x.pagesDiscovered ? Math.round(100 * x.pagesCrawled / x.pagesDiscovered) : '?'}%`);
  rec('P3-BUG12', 'CommandCenter', 'Saksham BUG-12: crawler progress equals pagesCrawled/pagesDiscovered in the data', arr.every((x) => !x.pagesDiscovered || Math.abs(x.progress - 100 * x.pagesCrawled / x.pagesDiscovered) <= 2) ? 'PASS' : 'FAIL', rows.join('; '));
  await p.close();
});

await safe('P3-02', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev', { timeout: 120000 });
  // BUG-02: counters vs chart data while live
  const read = async () => ({ threats: +(await p.locator('.cc-stats').innerText()).match(/Threats detected\s*\n?\s*([\d,]+)/)?.[1]?.replace(/,/g, ''), labels: await p.$$eval('svg[role="img"]', (e) => e.map((x) => x.getAttribute('aria-label')).filter(Boolean).join(' || ')) });
  const a = await read();
  await p.getByRole('button', { name: 'Simulate activity' }).click(); await p.waitForTimeout(20000);
  const b = await read();
  rec('P3-BUG02', 'CommandCenter', 'Saksham BUG-02: when live counters rise, the time-based charts change too', (b.threats > a.threats && a.labels !== b.labels) ? 'PASS' : (b.threats > a.threats ? 'FAIL' : 'INFO'), `threats ${a.threats}->${b.threats}; chart labels changed=${a.labels !== b.labels}`);
  // BUG-06: pause feed vs crawlers
  await p.getByRole('button', { name: 'Pause feed' }).click(); await p.waitForTimeout(500);
  const s1 = await p.locator('.cc-stats').innerText(); await p.waitForTimeout(4000); const s2 = await p.locator('.cc-stats').innerText();
  rec('P3-BUG06', 'CommandCenter', 'Saksham BUG-06: with feed paused, running crawlers are not frozen (pages still advance)', s1 !== s2 ? 'PASS' : 'FAIL', `stats changed while feed paused: ${s1 !== s2}`);
  await p.getByRole('button', { name: 'Resume feed' }).click();
  // BUG-05 progress loops while running, BUG-09 feed cap
  const prog = []; for (let i = 0; i < 18; i++) { prog.push(await p.$$eval('.cc-crawlers__item', (e) => e.map((x) => { const m = x.textContent.match(/(\d+)\s*%/); return m ? +m[1] : null; }).join(','))); await p.waitForTimeout(2000); }
  let dropped = false; for (let i = 1; i < prog.length; i++) { const A = prog[i - 1].split(','), B = prog[i].split(','); A.forEach((v, j) => { if (v !== '' && B[j] !== '' && +B[j] < +v - 5) dropped = true; }); }
  rec('P3-BUG05', 'CommandCenter', 'Saksham BUG-05: a running crawler\'s progress never falls back (e.g. 100 → 0) over ~36 s', !dropped ? 'PASS' : 'FAIL', prog.slice(0, 4).join(' | ') + ' ... ' + prog.at(-1));
  await p.close();
});

await safe('P6-F1', async () => {
  const p = await newPage(browser, { viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForSelector('.cc-crawlers', { timeout: 120000 });
  const names = p.locator('.cc-crawlers__name'); const n = await names.count(); const out = []; let bad = false;
  for (let i = 0; i < n; i++) { await names.nth(i).scrollIntoViewIfNeeded(); await names.nth(i).hover(); await p.waitForTimeout(500); const r = await p.evaluate(() => { const t = document.querySelector('[role="tooltip"]'); if (!t) return null; const b = t.getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), vw: innerWidth, sw: document.documentElement.scrollWidth }; }); out.push(JSON.stringify(r)); if (r && (r.l < 0 || r.r > r.vw || r.sw > r.vw + 1)) bad = true; await p.mouse.move(0, 0); await p.waitForTimeout(200); }
  rec('P6-F1', 'Tooltip', 'Ateeb F1: tooltips on the crawler names stay inside a 375 px viewport and cause no sideways scroll', bad ? 'FAIL' : 'PASS', out.join(' | '));
  await p.close();
});

await safe('P6-MODAL', async () => {
  const p = await newPage(browser, { reducedMotion: 'reduce' }); await p.goto(BASE); await p.locator('.nav-item').nth(2).click({ timeout: 120000 }); await p.waitForSelector('.threat-card', { timeout: 120000 });
  await p.locator('.threat-card').first().focus(); await p.keyboard.press('Enter'); const dlg = p.getByRole('dialog'); await dlg.waitFor();
  const inside = async () => p.evaluate(() => !!document.activeElement.closest('[role="dialog"]'));
  let ok = true; for (let i = 0; i < 9; i++) { await p.keyboard.press('Tab'); if (!(await inside())) ok = false; }
  for (let i = 0; i < 5; i++) { await p.keyboard.press('Shift+Tab'); if (!(await inside())) ok = false; }
  rec('P6-MODAL', 'UI kit', 'Ateeb v5: modal traps Tab / Shift+Tab (9 forward, 5 back stay inside)', ok ? 'PASS' : 'FAIL', `inside=${ok}`);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);
  const cardHover = async () => { const c = p.locator('.threat-card').nth(1); const a = await c.boundingBox(); await c.hover(); await p.waitForTimeout(400); const b = await c.boundingBox(); await p.mouse.move(0, 0); return Math.abs(a.y - b.y) + Math.abs(a.x - b.x); };
  const d = await cardHover();
  rec('P6-HOVER', 'UI kit', 'Ateeb v5: cards do not move on hover (no lift that makes edge hover flicker)', d <= 1 ? 'PASS' : 'FAIL', `card moved ${d}px`);
  await p.close();
});

await safe('CLAIMS', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.locator('.nav-item').nth(1).click({ timeout: 120000 }); await p.waitForSelector('text=PAGES CRAWLED', { timeout: 120000 });
  const inputs = await p.locator('main input, main textarea').count();
  const read = async () => +(await p.locator('text=PAGES CRAWLED').locator('xpath=following-sibling::div[1]').textContent()).replace(/,/g, '');
  await p.getByRole('button', { name: 'START', exact: true }).click(); const steps = []; let last = await read();
  for (let i = 0; i < 14; i++) { await p.waitForTimeout(700); const v = await read(); steps.push(v - last); last = v; }
  rec('CLAIM-H1', 'Himanshu', 'Report claims a URL input with empty/clearnet/protocol validation and an ERROR badge', inputs > 0 ? 'PASS' : 'FAIL', `inputs on Crawler tab=${inputs}; no URL field, no ERROR badge exists in this build`);
  rec('CLAIM-H2', 'Himanshu', 'Report claims Pages Crawled "strictly steps +1" at every speed', steps.every((s) => s === 0 || s === 1) ? 'PASS' : 'INFO', `increments per 0.7 s at 1x: ${JSON.stringify(steps)}`);
  await p.close();
});

save('l_cc'); await browser.close(); console.log('DONE L');
