import { launch, newPage, rec, save, tab, btn, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, area, name, fn) => { try { await fn(); } catch (e) { rec(id, area, name, 'ERROR', String(e.message).split('\n')[0].slice(0, 200)); } };
const sel = (p, label) => p.getByLabel(label);
const go = async (p, n) => { await p.locator('.nav-item').nth(n - 1).click({ timeout: 60000 }); await p.waitForTimeout(400); };

await safe('TI-14', 'Integration', 'Filter persistence', async () => {
  const p = await newPage(browser); await p.goto(BASE); await go(p, 3); await p.waitForSelector('.threat-card');
  await p.getByRole('searchbox').fill('tor'); await sel(p, 'Filter by severity').selectOption('High'); await sel(p, 'Sort threats').selectOption('Oldest');
  await go(p, 1); await go(p, 3); await p.waitForSelector('.threat-page');
  const v = [await p.getByRole('searchbox').inputValue(), await sel(p, 'Filter by severity').inputValue(), await sel(p, 'Sort threats').inputValue()];
  rec('TI-14', 'Integration', 'Search/severity/sort retained after leaving and returning to Threat Intelligence', (v[0] === 'tor' && v[1] === 'High' && v[2] === 'Oldest') ? 'PASS' : 'FAIL', `after return: search="${v[0]}" severity=${v[1]} sort=${v[2]}`);
  await p.close();
});

await safe('TI-16', 'Threat Intel', 'Modal focus restore via Escape and Close button', async () => {
  const p = await newPage(browser); await p.goto(BASE); await go(p, 3); await p.waitForSelector('.threat-card');
  const out = [];
  for (const how of ['Escape', 'close']) {
    await p.locator('.threat-card').nth(2).focus(); await p.keyboard.press('Enter'); await p.getByRole('dialog').waitFor();
    if (how === 'Escape') await p.keyboard.press('Escape'); else await p.getByRole('button', { name: 'Close dialog' }).click();
    await p.waitForTimeout(250);
    out.push(how + ':' + await p.evaluate(() => document.activeElement?.getAttribute('aria-label') || document.activeElement?.tagName));
  }
  rec('TI-16', 'Threat Intel', 'Focus returns to the originating card after closing via Esc and via Close button', out.every((o) => /Open details/.test(o)) ? 'PASS' : 'FAIL', out.join(' | '));
  await p.close();
});

await safe('CC-01', 'Command Center', 'Counters vs data, severity filter, keyboard', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev');
  const nums = await p.$$eval('.cc-sev__count', (e) => e.map((x) => +x.textContent.replace(/,/g, '')));
  const stat = +(await p.locator('.cc-stats .dt-stat, .cc-stats > *').first().innerText().then((t) => (t.match(/\d[\d,]*/g) || ['0']).find((x) => +x.replace(/,/g, '') > 5) || '0')).replace(/,/g, '');
  const json = (await import('fs')).default.readFileSync('/home/claude/work/Task3/Integrated-Without-Spider/src/mock-data/threats.json', 'utf8'); const t = JSON.parse(json);
  const exp = ['critical', 'high', 'medium', 'low'].map((k) => t.filter((x) => x.severity === k).length);
  rec('CC-01', 'Command Center', 'Severity counters equal underlying threats.json distribution', JSON.stringify(nums) === JSON.stringify(exp) ? 'PASS' : 'FAIL', `ui=${nums} data=${exp} firstStat=${stat}`);
  const sevCards = p.locator('.cc-sev__card');
  await sevCards.nth(0).click(); await p.waitForTimeout(200);
  const filtered = await p.locator('.cc-chip.is-on').textContent(); const sub = await p.locator('text=/Filtered:/').textContent().catch(() => '');
  await sevCards.nth(0).click(); await p.waitForTimeout(200); const back = await p.locator('.cc-chip.is-on').textContent();
  rec('CC-02', 'Command Center', 'Clicking a severity card filters Recent activity and clicking again clears', (filtered === 'critical' && back === 'all') ? 'PASS' : 'FAIL', `on=${filtered} sub="${sub}" after=${back}`);
  await sevCards.nth(1).focus(); await p.keyboard.press('Enter'); await p.waitForTimeout(150); const kb = await p.locator('.cc-chip.is-on').textContent();
  await p.keyboard.press('Space'); await p.waitForTimeout(150); const kb2 = await p.locator('.cc-chip.is-on').textContent();
  rec('CC-03', 'Command Center', 'Severity cards operable by keyboard (Enter selects, Space toggles)', (kb === 'high' && kb2 === 'all') ? 'PASS' : 'FAIL', `enter→${kb} space→${kb2}`);
  for (const k of ['critical', 'high', 'medium', 'low']) { await p.locator('.cc-chip', { hasText: k }).click(); await p.waitForTimeout(100); }
  await p.locator('.cc-chip', { hasText: 'all' }).click();
  // recent activity filter correctness: each filtered row must be of that severity (check text count change)
  const allRows = await p.locator('.cc-span-3 [class*="log"] >> nth=0').count().catch(() => 0);
  const share = await p.$$eval('.cc-sev .dt-progress, .cc-sev [role="progressbar"]', (e) => e.map((x) => x.getAttribute('aria-valuenow')));
  rec('CC-04', 'Command Center', 'Severity share bars sum to ~100%', 'INFO', `aria-valuenow=${JSON.stringify(share)}`);
  await p.close();
});

await safe('CC-05', 'Command Center', 'Crawler cards, hero control, feed pause', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-crawlers');
  const items = p.locator('.cc-crawlers__item'); const n = await items.count();
  const status = async (i) => (await items.nth(i).locator('.dt-badge, [class*="badge"]').first().textContent()).trim().toLowerCase();
  const s0 = []; for (let i = 0; i < n; i++) s0.push(await status(i));
  await items.nth(1).getByRole('button', { name: 'Start' }).click(); await p.waitForTimeout(300);
  const a = await status(1); await items.nth(1).getByRole('button', { name: 'Pause' }).click(); await p.waitForTimeout(300); const b = await status(1);
  await items.nth(1).getByRole('button', { name: 'Resume' }).click(); await p.waitForTimeout(300);
  await items.nth(1).getByRole('button', { name: 'Stop' }).click(); await p.waitForTimeout(300); const c = await status(1);
  rec('CC-05', 'Command Center', 'Per-crawler Start→Pause→Resume→Stop updates its badge', (/run/.test(a) && /paus/.test(b) && /stop/.test(c)) ? 'PASS' : 'FAIL', `initial=${s0} start=${a} pause=${b} stop=${c}`);
  // hero & fleet
  await p.getByRole('button', { name: 'Simulate activity' }).click(); await p.waitForTimeout(400);
  const act = await p.locator('.cc-stats').innerText(); const chip = await p.locator('.hero-chips span').filter({ hasText: 'crawler' }).textContent();
  const runningLabel = await p.locator('text=/\\d+ running/').first().textContent();
  rec('CC-06', 'Command Center', 'Hero "Simulate activity" starts whole fleet; chip=LIVE; "N running" = 4', (/LIVE/.test(chip) && /4 running/.test(runningLabel)) ? 'PASS' : 'FAIL', `chip=${chip} ${runningLabel}`);
  await p.getByRole('button', { name: 'Pause feed' }).click(); await p.waitForTimeout(300);
  const badge = await p.locator('.cc-head__right').innerText();
  const ev0 = await p.locator('.cc-span-3').innerText(); await p.waitForTimeout(6000); const ev1 = await p.locator('.cc-span-3').innerText();
  const crawled0 = await p.locator('.cc-stats').innerText(); await p.waitForTimeout(3000); const crawled1 = await p.locator('.cc-stats').innerText();
  rec('CC-07', 'Command Center', 'Pause feed: header badge says PAUSED and no new feed lines/threats appear', (/PAUSED/.test(badge) && ev0 === ev1) ? 'PASS' : 'FAIL', `badge="${badge.replace(/\n/g, ' ')}" feedUnchanged=${ev0 === ev1}`);
  rec('CC-08', 'Command Center', 'While feed is PAUSED crawlers still running & pages counter still advances (status consistency)', 'INFO', `stats changed while "PAUSED": ${crawled0 !== crawled1}`);
  // misleading LIVE labels with everything idle
  const q = await newPage(browser); await q.goto(BASE); await q.waitForSelector('.cc-head');
  const ccBadge = await q.locator('.cc-head__right').innerText(); const topLive = await q.locator('.live-pill').innerText(); const chip2 = await q.locator('.hero-chips span').filter({ hasText: 'crawler' }).textContent();
  rec('ST-01', 'Command Center', 'With every crawler IDLE, "LIVE"/"LIVE MONITORING" indicators should not claim live activity', (/LIVE/.test(ccBadge) || /LIVE/.test(topLive)) ? 'FAIL' : 'PASS', `topbar="${topLive}" cc badge="${ccBadge.replace(/\n/g, ' ')}" hero chip="${chip2}"`);
  await q.close(); await p.close();
});

await safe('CC-09', 'Command Center', 'Charts values vs data', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-grid');
  const donut = await p.locator('svg[role="img"]').evaluateAll((els) => els.map((e) => e.getAttribute('aria-label')));
  rec('CC-09', 'Charts', 'Chart accessible labels present on every chart SVG', donut.every(Boolean) ? 'PASS' : 'FAIL', JSON.stringify(donut).slice(0, 380));
  await p.close();
});

/* ---------- Responsive ---------- */
await safe('RS-01', 'Responsive', 'Overflow / clipping per viewport and tab', async () => {
  const sizes = [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [414, 896], [390, 844], [360, 740], [320, 640]];
  const p = await newPage(browser); await p.goto(BASE);
  const fails = []; const notes = [];
  for (const [w, h] of sizes) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500);
    for (const t of [1, 2, 3]) {
      await p.locator('.nav-item').nth(t - 1).click({ timeout: 60000 }); await p.waitForTimeout(700);
      const m = await p.evaluate(() => {
        const de = document.documentElement; const over = de.scrollWidth - de.clientWidth;
        const offenders = []; const vw = de.clientWidth;
        document.querySelectorAll('main *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width > 0 && (r.right > vw + 2) && !el.closest('.ticker,[aria-hidden="true"],canvas') && getComputedStyle(el).position !== 'fixed') { let anc = el.parentElement, clipped = false; while (anc && anc !== document.body) { const o = getComputedStyle(anc).overflowX; if (o === 'auto' || o === 'hidden' || o === 'scroll') { clipped = true; break; } anc = anc.parentElement; } if (!clipped) offenders.push((el.className && el.className.toString().slice(0, 40)) || el.tagName); } });
        const nav = document.querySelector('.nav').getBoundingClientRect();
        const small = [...document.querySelectorAll('button, a, select, input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24) && !e.closest('[aria-hidden="true"]'); }).length;
        return { over, offenders: [...new Set(offenders)].slice(0, 5), navBottom: nav.top > window.innerHeight / 2, navLeft: nav.left < 5, small };
      });
      if (m.over > 1) fails.push(`${w}px tab${t}: page scrolls sideways by ${m.over}px`);
      if (m.offenders.length) fails.push(`${w}px tab${t}: content past viewport: ${m.offenders.join(',')}`);
      notes.push(`${w}:t${t}:nav=${m.navBottom ? 'bottom' : m.navLeft ? 'side' : '?'}:tiny=${m.small}`);
      if (t === 2 || w === 390) await p.screenshot({ path: `/home/claude/work/qa/shots/r_${w}_tab${t}.png` });
    }
  }
  rec('RS-01', 'Responsive', 'No horizontal scroll / content beyond viewport on any tab at 1920/1440/1024/768/414/390/360/320', fails.length ? 'FAIL' : 'PASS', fails.join(' ; ') || 'all clean');
  rec('RS-02', 'Responsive', 'Nav layout per width (side/rail on desktop+tablet, bottom bar on phone)', 'INFO', notes.filter((x, i) => i % 3 === 0).join(' '));
  rec('RS-03', 'Responsive', 'Interactive controls below 24×24 px (WCAG 2.5.8 minimum) across sizes', 'INFO', notes.filter((x) => !/tiny=0/.test(x)).join(' ') || 'none');
  await p.close();
});

/* ---------- Keyboard / a11y ---------- */
await safe('AX-01', 'Accessibility', 'Keyboard tab order and visible focus', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev');
  const seen = []; let invisible = [];
  for (let i = 0; i < 45; i++) {
    await p.keyboard.press('Tab');
    const info = await p.evaluate(() => { const e = document.activeElement; if (!e || e === document.body) return null; const cs = getComputedStyle(e); const vis = (cs.outlineStyle !== 'none' && parseFloat(cs.outlineWidth) > 0) || (cs.boxShadow && cs.boxShadow !== 'none'); return { n: (e.getAttribute('aria-label') || e.textContent || e.tagName).trim().slice(0, 28), vis: Boolean(vis), tag: e.tagName }; });
    if (info) { seen.push(info.n); if (!info.vis) invisible.push(info.n); }
  }
  rec('AX-01', 'Accessibility', 'Every focusable element reached by Tab shows a visible focus indicator (45 stops, Command Center)', invisible.length ? 'FAIL' : 'PASS', invisible.length ? 'no indicator: ' + [...new Set(invisible)].join(' | ') : `${seen.length} stops ok`);
  await p.close();
});

await safe('AX-02', 'Accessibility', 'Reduced motion', async () => {
  const p = await newPage(browser, { reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForTimeout(1500);
  const r = await p.evaluate(() => { const anims = document.getAnimations().filter((a) => a.playState === 'running'); const long = anims.filter((a) => { const t = a.effect?.getComputedTiming?.(); return t && (t.iterations === Infinity); }).map((a) => (a.effect.target?.className?.toString() || a.effect.target?.tagName || '?').slice(0, 30) + ':' + (a.animationName || a.transitionProperty)); return { running: anims.length, infinite: [...new Set(long)].slice(0, 12) }; });
  rec('AX-02', 'Accessibility', 'With prefers-reduced-motion: reduce, no infinite CSS animations keep running', r.infinite.length === 0 ? 'PASS' : 'FAIL', `running=${r.running} infinite=${JSON.stringify(r.infinite)}`);
  await p.close();
});

/* ---------- Layering ---------- */
await safe('LY-01', 'Layering', 'Background effects never intercept pointer events', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev');
  const r = await p.evaluate(() => { const bad = []; document.querySelectorAll('body *').forEach((el) => { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); if ((cs.position === 'fixed' || cs.position === 'absolute') && r.width >= innerWidth * 0.5 && r.height >= innerHeight * 0.5 && cs.pointerEvents !== 'none' && cs.display !== 'none' && cs.visibility !== 'hidden' && !el.closest('.dt-modal__backdrop') && !el.matches('.app, .main, .content, main, #root')) bad.push((el.className?.toString() || el.tagName).slice(0, 50)); }); return [...new Set(bad)]; });
  const pts = await p.evaluate(() => { const out = []; document.querySelectorAll('button, .nav-item, select, input').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width < 1 || r.top < 0 || r.bottom > innerHeight) return; const hit = document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2); if (hit && !el.contains(hit) && !hit.contains(el)) out.push((el.textContent || el.className).trim().slice(0, 25) + ' ← ' + (hit.className?.toString() || hit.tagName).slice(0, 30)); }); return out.slice(0, 8); });
  rec('LY-01', 'Layering', 'No large fixed/absolute effect layer with pointer-events enabled', r.length ? 'FAIL' : 'PASS', r.join(',') || 'all effect layers pointer-events:none');
  rec('LY-02', 'Layering', 'Centre of every visible button/nav/select/input is actually hit-testable (not covered)', pts.length ? 'FAIL' : 'PASS', pts.join(' | ') || 'clean');
  await p.close();
});

/* ---------- Stability / perf ---------- */
await safe('ST-02', 'Stability', 'Repeated navigation soak + console cleanliness', async () => {
  const p = await newPage(browser); await p.goto(BASE);
  await p.locator('.nav-item').nth(1).click(); await btn(p, 'START').click();
  const heap0 = await p.evaluate(() => performance.memory?.usedJSHeapSize || 0); const dom0 = await p.evaluate(() => document.getElementsByTagName('*').length);
  const t0 = Date.now();
  for (let i = 0; i < 20; i++) for (const k of ['1', '2', '3']) await p.keyboard.press(k);
  await p.waitForTimeout(1500);
  const heap1 = await p.evaluate(() => performance.memory?.usedJSHeapSize || 0); const dom1 = await p.evaluate(() => document.getElementsByTagName('*').length);
  rec('ST-02', 'Stability', '60 rapid tab switches while crawling: no console errors/warnings', p.problems.length === 0 ? 'PASS' : 'FAIL', `problems=${JSON.stringify(p.problems.slice(0, 4))} elapsed=${Date.now() - t0}ms`);
  rec('ST-03', 'Stability', 'No runaway DOM/heap growth after 60 switches', (dom1 < dom0 * 1.6) ? 'PASS' : 'FAIL', `DOM ${dom0}->${dom1}; heap ${(heap0 / 1e6).toFixed(1)}MB->${(heap1 / 1e6).toFixed(1)}MB (swiftshader sandbox, indicative only)`);
  await p.close();
});

await safe('ST-04', 'Stability', 'Palette commands & boot skip', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev');
  const out = [];
  const run = async (label) => { await p.keyboard.press('Control+k'); await p.getByRole('dialog').or(p.locator('.palette')).first().waitFor(); await p.keyboard.type(label); await p.keyboard.press('Enter'); await p.waitForTimeout(500); };
  await run('Go to Dark Web Crawler'); out.push('crawler:' + (await p.locator('.nav-item.is-active').textContent()));
  await run('Go to Threat'); out.push('intel:' + (await p.locator('.nav-item.is-active').textContent()));
  await run('Go to Command'); out.push('cmd:' + (await p.locator('.nav-item.is-active').textContent()));
  await run('Simulate crawler'); out.push('crawl:' + (await p.locator('.hero-chips span').filter({ hasText: 'crawler' }).textContent()));
  await run('Stop crawler'); out.push('stop:' + (await p.locator('.hero-chips span').filter({ hasText: 'crawler' }).textContent()));
  await run('Turn off digital rain'); out.push('rain:' + (await p.locator('button[aria-label="Toggle digital rain"]').getAttribute('aria-pressed')));
  await run('Replay boot'); await p.waitForTimeout(500); const boot = await p.locator('.boot, [class*="boot"]').count(); await p.keyboard.press('x'); await p.waitForTimeout(1500); const boot2 = await p.locator('.boot, [class*="boot"]').count();
  out.push(`boot:${boot}->${boot2}`);
  const ok = /Dark Web Crawler/.test(out[0]) && /Threat Intelligence/.test(out[1]) && /Command Center/.test(out[2]) && /LIVE/.test(out[3]) && /STOPPED/i.test(out[4]) && /false/.test(out[5]) && boot > 0 && boot2 === 0;
  rec('ST-04', 'Stability', 'Command palette: every command works; boot replay can be skipped with a key', ok ? 'PASS' : 'FAIL', out.join(' | '));
  await p.close();
});

save('b_more');
await browser.close();
console.log('DONE B');
