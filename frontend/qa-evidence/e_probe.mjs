import { launch, newPage, rec, save, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, fn) => { try { await fn(); } catch (e) { rec(id, '-', '-', 'ERROR', String(e.message).split('\n')[0].slice(0, 220)); } };
await safe('PAL', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev');
  const out = [];
  const run = async (label) => { await p.keyboard.press('Control+k'); await p.locator('.palette').waitFor({ timeout: 60000 }); await p.locator('.palette-input input').fill(label); await p.keyboard.press('Enter'); await p.waitForTimeout(600); };
  const act = () => p.locator('.nav-item.is-active .nav-label').textContent();
  await run('Go to Dark Web Crawler'); out.push('crawler:' + await act());
  await run('Go to Threat'); out.push('intel:' + await act());
  await run('Go to Command'); out.push('cmd:' + await act());
  await run('Simulate crawler'); out.push('crawl:' + (await p.locator('.hero-chips span').filter({ hasText: 'crawler' }).textContent()));
  await run('Stop crawler'); out.push('stop:' + (await p.locator('.hero-chips span').filter({ hasText: 'crawler' }).textContent()));
  await run('Turn off digital rain'); out.push('rain:' + await p.locator('button[aria-label="Toggle digital rain"]').getAttribute('aria-pressed'));
  await run('Replay boot'); await p.waitForTimeout(400); const b1 = await p.locator('.boot').count(); await p.keyboard.press('x'); await p.waitForTimeout(2500); const b2 = await p.locator('.boot').count(); out.push(`boot:${b1}->${b2}`);
  await p.keyboard.press('Control+k'); await p.locator('.palette-input input').fill('zzz'); const empty = await p.locator('.palette-empty').count(); await p.keyboard.press('Enter'); await p.keyboard.press('Escape'); await p.waitForTimeout(300); const closed = await p.locator('.palette').count();
  out.push(`noMatch:${empty} closedByEsc:${closed === 0}`);
  const ok = /Crawler/.test(out[0]) && /Threat/.test(out[1]) && /Command/.test(out[2]) && /LIVE/.test(out[3]) && /STOPPED/i.test(out[4]) && /false/.test(out[5]) && b1 > 0 && b2 === 0 && empty === 1 && closed === 0;
  rec('ST-04', 'Stability', 'Command palette: all commands work, no-match message, Esc closes; boot replay skippable', ok ? 'PASS' : 'FAIL', out.join(' | '));
  await p.close();
});
await safe('TINY', async () => {
  const p = await newPage(browser, { viewport: { width: 390, height: 844 } }); await p.goto(BASE); await p.locator('.nav-item').nth(2).click({ timeout: 120000 }); await p.waitForTimeout(3000);
  const t = await p.evaluate(() => [...document.querySelectorAll('button, a, select, input')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.height > 0 && (r.height < 24 || r.width < 24); }).map((e) => `${e.tagName}.${(e.className || '').toString().slice(0, 25)} ${Math.round(e.getBoundingClientRect().width)}x${Math.round(e.getBoundingClientRect().height)} "${(e.getAttribute('aria-label') || e.textContent || '').trim().slice(0, 20)}"`));
  rec('RS-04', 'Responsive', 'Controls under 24×24 px on Threat Intelligence at 390px', 'INFO', JSON.stringify(t));
  const card = await p.evaluate(() => { const c = document.querySelector('.threat-card'); const r = c.getBoundingClientRect(); return { w: Math.round(r.width), over: c.scrollWidth - c.clientWidth }; });
  rec('RS-05', 'Responsive', 'Threat card fits 390px width without internal overflow (long 64-char hash IOC)', card.over <= 1 ? 'PASS' : 'FAIL', JSON.stringify(card));
  await p.locator('.threat-card').first().click(); await p.waitForTimeout(800);
  const m = await p.evaluate(() => { const d = document.querySelector('[role=dialog]'); const r = d.getBoundingClientRect(); return { l: Math.round(r.left), r: Math.round(r.right), vw: innerWidth, h: Math.round(r.height), vh: innerHeight, over: d.scrollWidth - d.clientWidth }; });
  rec('RS-06', 'Responsive', 'Details modal fits within 390×844 viewport, no horizontal overflow', (m.l >= 0 && m.r <= m.vw && m.over <= 1 && m.h <= m.vh) ? 'PASS' : 'FAIL', JSON.stringify(m));
  await p.close();
});
await safe('CON', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.waitForSelector('.cc-sev');
  const lum = (c) => { const [r, g, b] = c.map((v) => { v /= 255; return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4; }); return 0.2126 * r + 0.7152 * g + 0.0722 * b; };
  const worst = [];
  for (const t of [1, 2, 3]) {
    await p.locator('.nav-item').nth(t - 1).click({ timeout: 120000 }); await p.waitForTimeout(3000);
    const items = await p.evaluate(() => {
      const parse = (s) => { const m = s.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(',').map((x) => parseFloat(x)); return a.length === 3 ? [...a, 1] : a; };
      const bgOf = (el) => { let e = el; let acc = [5, 8, 12]; const layers = []; while (e) { const c = parse(getComputedStyle(e).backgroundColor); if (c && c[3] > 0) layers.push(c); e = e.parentElement; } let base = [5, 8, 12]; for (const c of layers.reverse()) base = base.map((v, i) => v * (1 - c[3]) + c[i] * c[3]); return base; };
      const out = []; const seen = new Set();
      document.querySelectorAll('main *, .sidebar *, .topbar *').forEach((el) => {
        if (![...el.childNodes].some((n) => n.nodeType === 3 && n.textContent.trim())) return; const r = el.getBoundingClientRect(); if (r.width < 2 || r.height < 2) return; const cs = getComputedStyle(el); if (cs.visibility === 'hidden' || +cs.opacity === 0) return;
        const fg = parse(cs.color); if (!fg) return; const bg = bgOf(el); const key = cs.color + '|' + bg.map(Math.round).join(',') + '|' + cs.fontSize; if (seen.has(key)) return; seen.add(key);
        out.push({ t: el.textContent.trim().slice(0, 28), fg: fg.slice(0, 3).map((v) => v * fg[3] + bg[0] * 0 ), fga: fg[3], bg, fs: parseFloat(cs.fontSize), fw: cs.fontWeight });
      });
      return out;
    });
    for (const it of items) { const bg = it.bg; const fg = it.fg.map((v, i) => v * it.fga + bg[i] * (1 - it.fga)); const L1 = lum(fg), L2 = lum(bg); const cr = (Math.max(L1, L2) + 0.05) / (Math.min(L1, L2) + 0.05); const large = it.fs >= 24 || (it.fs >= 18.66 && +it.fw >= 700); if (cr < (large ? 3 : 4.5)) worst.push({ tab: t, t: it.t, cr: +cr.toFixed(2), fs: it.fs }); }
  }
  worst.sort((a, b) => a.cr - b.cr);
  rec('AX-03', 'Accessibility', 'Text contrast ≥ 4.5:1 (3:1 large) over the three modules (static background estimate, no effect layers)', worst.length ? 'FAIL' : 'PASS', `${worst.length} below threshold; worst: ` + JSON.stringify(worst.slice(0, 8)));
  await p.close();
});
save('e_probe'); await browser.close(); console.log('DONE E');
