import { launch, newPage, rec, save, tab, btn, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, area, name, fn) => { try { await fn(); } catch (e) { rec(id, area, name, 'ERROR', String(e.message).split('\n')[0].slice(0, 200)); } };
const sel = (p, label) => p.getByLabel(label);
const go = async (p, n) => { await p.locator('.nav-item').nth(n - 1).click({ timeout: 120000 }); await p.waitForTimeout(400); };

/* ---------- Responsive ---------- */
await safe('RS-01', 'Responsive', 'Overflow / clipping per viewport and tab', async () => {
  const sizes = [[1920, 1080], [1440, 900], [1024, 768], [768, 1024], [414, 896], [390, 844], [360, 740], [320, 640]];
  const p = await newPage(browser); await p.goto(BASE);
  const fails = []; const notes = [];
  for (const [w, h] of sizes) {
    await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(500);
    for (const t of [1, 2, 3]) {
      await p.locator('.nav-item').nth(t - 1).click({ timeout: 120000 }); await p.waitForTimeout(700);
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
    }
  }
  rec('RS-01', 'Responsive', 'No horizontal scroll / content beyond viewport on any tab at 1920/1440/1024/768/414/390/360/320', fails.length ? 'FAIL' : 'PASS', fails.join(' ; ') || 'all clean');
  rec('RS-02', 'Responsive', 'Nav layout per width (side/rail on desktop+tablet, bottom bar on phone)', 'INFO', notes.filter((x, i) => i % 3 === 0).join(' '));
  rec('RS-03', 'Responsive', 'Interactive controls below 24×24 px (WCAG 2.5.8 minimum) across sizes', 'INFO', notes.filter((x) => !/tiny=0/.test(x)).join(' ') || 'none');
  await p.close();
});


await safe('CC-08', 'Command Center', 'Pages counter while feed paused', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-crawlers');
  await p.getByRole('button', { name: 'Simulate activity' }).click(); await p.getByRole('button', { name: 'Pause feed' }).click();
  const read = async () => (await p.locator('.cc-stats > *').nth(2).innerText()).replace(/\n/g, ' ');
  const a = await read(); await p.waitForTimeout(5000); const b = await read();
  rec('CC-08', 'Command Center', 'Pages-crawled stat keeps advancing while crawlers run (feed paused)', a !== b ? 'PASS' : 'FAIL', `${a} -> ${b}`);
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

save('c_retry');
await browser.close();
console.log('DONE C');
