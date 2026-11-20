import { launch, newPage, rec, save, BASE } from './lib.mjs';
const browser = await launch();
const p = await newPage(browser, { reducedMotion: 'reduce' });
await p.goto(BASE);
const go = async (n) => { await p.locator('.nav-item').nth(n - 1).click({ timeout: 120000 }); await p.waitForTimeout(1800); };
const size = async (w, h) => { await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(900); };
const safe = async (id, fn) => { try { await fn(); } catch (e) { rec(id, 'Layout', '-', 'ERROR', String(e.message).split('\n')[0].slice(0, 200)); } };
const hit = (a, b) => !(a.right <= b.left || b.right <= a.left || a.bottom <= b.top || b.bottom <= a.top);

await safe('GL-B1', async () => {
  await go(1);
  const out = [];
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024]]) {
    await size(w, h);
    const rows = await p.$$eval('.cc-crawlers__item', (els) => els.map((e) => { const row = e.querySelector('.cc-crawlers__row'); const name = e.querySelector('.cc-crawlers__name').getBoundingClientRect(); const act = e.querySelector('.cc-crawlers__actions').getBoundingClientRect(); return { rowH: Math.round(row.getBoundingClientRect().height), wrapped: act.top > name.bottom - 2 }; }));
    out.push(`${w}: wrapped=[${rows.map((r) => (r.wrapped ? 1 : 0))}] rowH=[${rows.map((r) => r.rowH)}]`);
  }
  const bad = out.filter((o) => /wrapped=\[.*1.*\]/.test(o) || new Set(o.match(/rowH=\[(.*)\]/)[1].split(',')).size > 1);
  rec('GL-B1', 'Layout', 'PDF Bug 1: Crawlers card rows lay out identically (Start/badge never wrap per-row) at 1440/1024/768', bad.length ? 'FAIL' : 'PASS', out.join(' | '));
});

await safe('GL-B2', async () => {
  const out = [];
  for (const [w, h] of [[1024, 768], [768, 1024]]) {
    await size(w, h);
    const r = await p.evaluate(() => { const c = [...document.querySelectorAll('.cc-grid > *')].find((e) => /Crawlers/.test(e.textContent.slice(0, 40))); const g = document.querySelector('.cc-grid'); const cards = [...g.children].map((e) => { const r = e.getBoundingClientRect(); return { t: Math.round(r.top), l: Math.round(r.left), w: Math.round(r.width) }; }); const cr = c.getBoundingClientRect(); const gr = g.getBoundingClientRect(); const sameRow = cards.filter((x) => Math.abs(x.t - Math.round(cr.top)) < 4); const used = sameRow.reduce((a, x) => a + x.w, 0); return { gridW: Math.round(gr.width), used, n: sameRow.length }; });
    out.push(`${w}: crawlersRow uses ${r.used}/${r.gridW}px (${r.n} card)`);
  }
  const bad = out.some((o) => { const m = o.match(/uses (\d+)\/(\d+)/); return +m[1] < +m[2] * 0.9; });
  rec('GL-B2', 'Layout', 'PDF Bug 2: no empty half-row beside the Crawlers card at 1024/768', bad ? 'FAIL' : 'PASS', out.join(' | '));
});

await safe('GL-B3', async () => {
  await size(1440, 900);
  const r = await p.evaluate(() => { const alpha = (el) => { const c = getComputedStyle(el).backgroundColor; const m = c.match(/rgba?\(([^)]+)\)/); if (!m) return null; const a = m[1].split(',').map(parseFloat); return a.length === 4 ? a[3] : 1; }; const q = (s) => document.querySelector(s); const pick = (s) => { const e = q(s); return e ? { a: alpha(e), blur: getComputedStyle(e).backdropFilter || getComputedStyle(e).webkitBackdropFilter } : null; }; return { topbar: pick('.topbar'), ticker: pick('.ticker'), nav: pick('.nav') }; });
  await size(375, 812); const m = await p.evaluate(() => { const e = document.querySelector('.nav'); const c = getComputedStyle(e); const mm = c.backgroundColor.match(/rgba?\(([^)]+)\)/)[1].split(',').map(parseFloat); return { a: mm.length === 4 ? mm[3] : 1, blur: c.backdropFilter }; });
  rec('GL-B3', 'Layout', 'PDF Bug 3: top bar, ticker and phone bottom bar are opaque enough that scrolled content does not show through', 'INFO', `desktop=${JSON.stringify(r)} phoneNav=${JSON.stringify(m)} (alpha<1 and no blur means content visibly bleeds through)`);
  rec('GL-B3b', 'Layout', 'PDF Bug 3 verdict', (r.topbar && r.topbar.a >= 0.95 && m.a >= 0.95) ? 'PASS' : 'FAIL', `topbar alpha=${r.topbar?.a} phone nav alpha=${m.a}`);
});

await safe('GL-T18', async () => {
  await size(1440, 900); await go(3);
  await p.evaluate(() => { const s = document.scrollingElement; s.scrollTo(0, 800); document.querySelector('main')?.scrollTo?.(0, 800); });
  await p.waitForTimeout(600);
  const r = await p.evaluate(() => ({ top: Math.round(document.querySelector('.topbar').getBoundingClientRect().top), ticker: Math.round(document.querySelector('.ticker').getBoundingClientRect().top), sy: Math.round(scrollY) }));
  rec('GL-T18', 'Layout', 'PDF Test 18: top bar and ticker stay pinned while scrolling', (r.top === 0 && r.ticker >= 0 && r.ticker < 80 && r.sy > 100) ? 'PASS' : 'FAIL', JSON.stringify(r));
});

await safe('GL-B4', async () => {
  const res = [];
  for (const t of [1, 2, 3]) { await go(t); const n = await p.$$eval('input, select, textarea', (els) => els.filter((e) => !e.id && !e.name).map((e) => (e.getAttribute('aria-label') || e.className || e.tagName).toString().slice(0, 25))); res.push(`tab${t}: ${n.length} ${JSON.stringify(n)}`); }
  rec('GL-B4', 'Layout', 'PDF Bug 4: every form field has an id or name (DevTools Issues)', res.every((r) => / 0 /.test(r)) ? 'PASS' : 'FAIL', res.join(' | '));
});

await safe('GL-B5', async () => {
  const out = []; let bad = false;
  for (const w of [1024, 900, 800, 768, 761, 700]) {
    await size(w, 900); await go(1);
    const r = await p.evaluate(() => { const b = document.querySelector('.crumbs, .breadcrumb, .topbar nav, .topbar-title'); const s = document.querySelector('.search-trigger, .topbar [aria-label*="ommand"], .topbar button[class*="search"]'); if (!b || !s) return { err: `crumb=${!!b} search=${!!s}` }; const a = b.getBoundingClientRect(); const c = s.getBoundingClientRect(); return { overlap: !(a.right <= c.left || c.right <= a.left), a: [Math.round(a.left), Math.round(a.right)], s: [Math.round(c.left), Math.round(c.right)] }; });
    out.push(`${w}:${JSON.stringify(r)}`); if (r.overlap) bad = true;
  }
  rec('GL-B5', 'Layout', 'PDF Bug 5: breadcrumb does not overlap the search box between 700 and 1024 px', bad ? 'FAIL' : 'PASS', out.join(' | '));
});

await safe('GL-B6', async () => {
  await size(375, 812); await go(1);
  const r = await p.evaluate(() => { const card = [...document.querySelectorAll('.cc-grid > *')].find((e) => /Threat level/.test(e.textContent.slice(0, 30))); const t = [...card.querySelectorAll('svg text, svg tspan, span, div, small')].filter((e) => e.children.length === 0 && e.textContent.trim()).map((e) => ({ t: e.textContent.trim().slice(0, 14), r: e.getBoundingClientRect() })); const o = []; for (let i = 0; i < t.length; i++) for (let j = i + 1; j < t.length; j++) { const a = t[i].r, b = t[j].r; if (a.width && b.width && !(a.right <= b.left + 1 || b.right <= a.left + 1 || a.bottom <= b.top + 1 || b.bottom <= a.top + 1)) o.push(t[i].t + '×' + t[j].t); } return { texts: t.map((x) => x.t), overlaps: o }; });
  rec('GL-B6', 'Layout', 'PDF Bug 6: threat-level gauge labels do not overlap at 375 px', r.overlaps.length ? 'FAIL' : 'PASS', JSON.stringify(r));
});

await safe('GL-B7', async () => {
  const r = await p.evaluate(() => { const card = [...document.querySelectorAll('.cc-grid > *')].find((e) => /Threats over time/.test(e.textContent.slice(0, 30))); const cr = card.getBoundingClientRect(); const labs = [...card.querySelectorAll('svg text, .cc-axis span, [class*="axis"] span')].map((e) => e.getBoundingClientRect()).filter((x) => x.width); const o = []; for (let i = 1; i < labs.length; i++) if (labs[i].left < labs[i - 1].right - 1 && Math.abs(labs[i].top - labs[i - 1].top) < 4) o.push(i); const out = labs.filter((x) => x.right > cr.right + 1 || x.left < cr.left - 1).length; return { n: labs.length, overlaps: o.length, outside: out, card: [Math.round(cr.left), Math.round(cr.right)] }; });
  rec('GL-B7', 'Layout', 'PDF Bug 7: Threats-over-time axis labels neither collide nor leave the card at 375 px', (r.overlaps || r.outside) ? 'FAIL' : 'PASS', JSON.stringify(r));
});

await safe('GL-B8', async () => {
  const out = [];
  for (const w of [375, 414, 600, 640]) { await size(w, 812); const r = await p.evaluate(() => getComputedStyle(document.querySelector('.cc-grid')).gridTemplateColumns.split(' ').length); out.push(`${w}px→${r} col`); }
  rec('GL-B8', 'Layout', 'PDF Bug 8: phone widths (≤640 px) use ONE column in the Command Center grid', out.every((o) => /→1 col/.test(o)) ? 'PASS' : 'FAIL', out.join(', '));
  await size(375, 812); const lg = await p.evaluate(() => { const l = document.querySelector('.cc-legend'); const card = l.closest('.dt-card, [class*="card"]'); const lr = l.getBoundingClientRect(); const cr = card.getBoundingClientRect(); return { legendRight: Math.round(lr.right), cardRight: Math.round(cr.right) }; });
  rec('GL-B8b', 'Layout', 'PDF Bug 8 symptom: severity legend stays inside its card at 375 px', lg.legendRight <= lg.cardRight + 1 ? 'PASS' : 'FAIL', JSON.stringify(lg));
});

await safe('GL-T30', async () => {
  const out = []; let bad = false;
  for (const [w, h] of [[1440, 900], [1024, 768], [768, 1024], [375, 812]]) {
    await size(w, h); const sig = [];
    for (const t of [1, 2, 3]) { await go(t); sig.push(await p.evaluate(() => { const e = document.querySelector('.topbar'); const r = e.getBoundingClientRect(); const k = [...e.children].map((c) => Math.round(c.getBoundingClientRect().left) + ':' + Math.round(c.getBoundingClientRect().width)).join(','); return `${Math.round(r.height)}|${k}`; })); }
    const same = sig.slice(1).every((s) => s.split('|')[0] === sig[0].split('|')[0]);
    if (!same) bad = true; out.push(`${w}: heights ${sig.map((s) => s.split('|')[0])}`);
  }
  rec('GL-T30', 'Layout', 'PDF Test 30: top bar has the same height/layout on all 3 tabs at 4 widths', bad ? 'FAIL' : 'PASS', out.join(' | '));
});

save('j_layout');
await browser.close();
console.log('DONE J');
