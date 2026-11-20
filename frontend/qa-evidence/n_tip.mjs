import { launch, newPage, rec, save, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, fn) => { try { await fn(); } catch (e) { rec(id, 'PDF', '-', 'ERROR', String(e.message).split('\n')[0].slice(0, 220)); } };
await safe('M3', async () => {
  for (const w of [375, 320]) {
    const p = await newPage(browser, { viewport: { width: w, height: 812 }, reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForSelector('.cc-crawlers', { timeout: 120000 });
    const n = await p.locator('.cc-crawlers__name').count(); const out = []; let bad = false;
    for (let i = 0; i < n; i++) { await p.locator('.cc-crawlers__name').nth(i).focus().catch(() => {}); await p.evaluate((i) => document.querySelectorAll('.cc-crawlers__item .dt-tip')[i].dispatchEvent(new MouseEvent('mouseover', { bubbles: true })), i); await p.locator('.cc-crawlers__item .dt-tip').nth(i).hover(); await p.waitForTimeout(450); const r = await p.evaluate((i) => { const b = document.querySelectorAll('.cc-crawlers__item [role="tooltip"]')[i].getBoundingClientRect(); return { l: Math.round(b.left), r: Math.round(b.right), vw: document.documentElement.clientWidth, sw: document.documentElement.scrollWidth }; }, i); out.push(`${r.l}..${r.r}`); if (r.l < 0 || r.r > r.vw || r.sw > r.vw + 1) bad = true; await p.mouse.move(0, 700); await p.waitForTimeout(150); }
    rec(`P6-F1-${w}`, 'Tooltip', `Ateeb F1 RETEST at ${w}px: all ${n} crawler tooltips inside the viewport, no sideways scroll`, bad ? 'FAIL' : 'PASS', out.join(' | ') + ` (viewport ${w})`);
    await p.close();
  }
});
save('n_tip'); await browser.close(); console.log('DONE N');
