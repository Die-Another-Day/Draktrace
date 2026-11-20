import { launch, newPage, rec, save, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, fn) => { try { await fn(); } catch (e) { rec(id, 'PDF', '-', 'ERROR', String(e.message).split('\n')[0].slice(0, 220)); } };
await safe('M1', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev', { timeout: 120000 }); await p.waitForTimeout(2000);
  const res = {}; for (const k of ['critical', 'high', 'medium', 'low']) { await p.locator('.cc-chip', { hasText: k }).click(); await p.waitForTimeout(250); const t = await p.locator('.cc-span-3').innerText(); res[k] = /No events match/i.test(t) ? 0 : 1; }
  await p.locator('.cc-chip', { hasText: 'all' }).click();
  rec('P3-BUG04', 'CommandCenter', 'Saksham BUG-04 RETEST: every severity filter shows events on load', Object.values(res).every(Boolean) ? 'PASS' : 'FAIL', JSON.stringify(res));
  await p.locator('.cc-chip', { hasText: 'high' }).click(); await p.locator('.cc-chip', { hasText: 'high' }).click(); await p.waitForTimeout(150); const on = await p.locator('.cc-chip.is-on').textContent();
  rec('P3-BUG08', 'CommandCenter', 'Saksham BUG-08 RETEST: second click on a chip clears the filter', on === 'all' ? 'PASS' : 'FAIL', `after two clicks: ${on}`);
  await p.locator('.cc-sev__card').nth(0).click(); await p.waitForTimeout(200); const cr = await p.locator('.cc-span-3').innerText();
  rec('P3-BUG04b', 'CommandCenter', 'Saksham BUG-04 RETEST: clicking the glowing Critical card lists critical events (not an empty list)', !/No events match/i.test(cr) ? 'PASS' : 'FAIL', cr.slice(0, 160).replace(/\n/g, ' | '));
  await p.close();
});
await safe('M2', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev', { timeout: 120000 });
  const sig = () => p.evaluate(() => { const card = [...document.querySelectorAll('.cc-grid > *')].find((e) => /Threats over time/.test(e.textContent.slice(0, 30))); const d = [...card.querySelectorAll('path, polyline')].map((x) => x.getAttribute('d') || x.getAttribute('points')).join('#'); const thr = document.querySelector('.cc-stats').innerText.replace(/\s+/g, ' '); const sev = [...document.querySelectorAll('.cc-sev__count')].map((x) => x.textContent).join('/'); const total = (document.querySelector('.cc-center svg')?.textContent || '').replace(/\s+/g, ' '); return { d, thr: thr.slice(0, 60), sev, total }; });
  const a = await sig(); await p.getByRole('button', { name: 'Simulate activity' }).click(); await p.waitForTimeout(22000); const b = await sig();
  rec('P3-BUG02', 'CommandCenter', 'Saksham BUG-02 RETEST: Threats-over-time line changes together with the live counters', (a.d !== b.d && a.sev !== b.sev) ? 'PASS' : 'FAIL', `counters ${a.sev} -> ${b.sev}; chart path changed=${a.d !== b.d}; donut centre "${a.total}" -> "${b.total}"`);
  const prog = []; for (let i = 0; i < 20; i++) { prog.push(await p.$$eval('.cc-crawlers__item [role="progressbar"]', (e) => e.map((x) => Number(x.getAttribute('aria-valuenow'))))); await p.waitForTimeout(2000); }
  let drop = false; for (let i = 1; i < prog.length; i++) prog[i].forEach((v, j) => { if (v < prog[i - 1][j] - 5) drop = true; });
  rec('P3-BUG05', 'CommandCenter', 'Saksham BUG-05 RETEST: running crawler progress never falls back over ~40 s', prog[0].length > 0 && !drop ? 'PASS' : (prog[0].length ? 'FAIL' : 'INFO'), `bars=${prog[0].length}; first=${JSON.stringify(prog[0])} last=${JSON.stringify(prog.at(-1))}`);
  const cap = await p.locator('.cc-span-3 [class*="row"], .cc-span-3 .dt-log__row').count();
  rec('P3-BUG09', 'CommandCenter', 'Saksham BUG-09: feed never exceeds 60 lines', cap <= 60 ? 'PASS' : 'FAIL', `lines now=${cap} (cap needs ~10 min of live feed to reach; see static check)`);
  await p.close();
});
await safe('M3', async () => {
  for (const w of [375, 320]) {
    const p = await newPage(browser, { viewport: { width: w, height: 812 }, reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForSelector('.cc-crawlers', { timeout: 120000 });
    const n = await p.locator('.cc-crawlers__name').count(); const out = []; let bad = false;
    for (let i = 0; i < n; i++) { await p.locator('.cc-crawlers__name').nth(i).focus().catch(() => {}); await p.evaluate((i) => document.querySelectorAll('.cc-crawlers__item .dt-tip')[i].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), i); await p.locator('.cc-crawlers__item .dt-tip').nth(i).hover(); await p.waitForTimeout(450); const r = await p.evaluate((i) => { const b = document.querySelectorAll('.cc-crawlers__item [role="tooltip"]')[i].getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }; }, i); out.push(`${r.l}..${r.r}`); if (r.l < 0 || r.r > r.vw || r.sw > r.vw + 1) bad = true; await p.mouse.move(0, 700); await p.waitForTimeout(150); }
    rec(`P6-F1-${w}`, 'Tooltip', `Ateeb F1 RETEST at ${w}px: all ${n} crawler tooltips inside the viewport, no sideways scroll`, bad ? 'FAIL' : 'PASS', out.join(' | ') + ` (viewport ${w})`);
    await p.close();
  }
});
await safe('M4', async () => {
  const p = await newPage(browser, { reducedMotion: 'reduce' }); await p.goto(BASE); await p.locator('.nav-item').nth(2).click({ timeout: 120000 }); await p.waitForSelector('.threat-card', { timeout: 120000 });
  const c = p.locator('.threat-card').nth(1); await c.scrollIntoViewIfNeeded(); const a = await c.boundingBox(); await c.hover(); await p.waitForTimeout(500); const b = await c.boundingBox();
  const hov = []; for (let i = 0; i < 10; i++) { await p.mouse.move(b.x + b.width / 2, b.y + b.height - 1); await p.waitForTimeout(80); hov.push(await c.evaluate((e) => e.matches(':hover'))); }
  rec('P6-HOVER', 'UI kit', 'Ateeb v5 RETEST: threat card does not move on hover and stays hovered with the cursor on its bottom edge (10/10)', (Math.abs(a.y - b.y) <= 1 && hov.every(Boolean)) ? 'PASS' : 'FAIL', `moved ${Math.abs(a.y - b.y)}px; hovered ${hov.filter(Boolean).length}/10`);
  await p.close();
});
save('m_retest'); await browser.close(); console.log('DONE M');
