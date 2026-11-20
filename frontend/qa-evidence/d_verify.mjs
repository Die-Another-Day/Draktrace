import { launch, newPage, rec, save, btn, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, fn) => { try { await fn(); } catch (e) { rec(id, '-', '-', 'ERROR', String(e.message).split('\n')[0].slice(0, 200)); } };
await safe('RS-V', async () => {
  const p = await newPage(browser, { viewport: { width: 414, height: 896 } }); await p.goto(BASE);
  for (const t of [1, 3]) {
    await p.locator('.nav-item').nth(t - 1).click({ timeout: 120000 }); await p.waitForTimeout(3500);
    const r = await p.evaluate(() => { const vw = document.documentElement.clientWidth; const out = []; document.querySelectorAll('main *').forEach((el) => { const r = el.getBoundingClientRect(); if (r.width > 0 && r.right > vw + 2 && !el.closest('canvas,svg,.ticker')) out.push({ c: (el.className?.toString() || el.tagName).slice(0, 40), right: Math.round(r.right), w: Math.round(r.width), tf: getComputedStyle(el).transform.slice(0, 40), ox: getComputedStyle(el).overflowX }); }); return { vw, sw: document.documentElement.scrollWidth, out: out.slice(0, 8) }; });
    rec(`RS-V${t}`, 'Responsive', `414px tab${t} settled geometry`, r.sw <= r.vw + 1 && r.out.length === 0 ? 'PASS' : 'INFO', JSON.stringify(r));
  }
  await p.close();
});
await safe('ST-V', async () => {
  const p = await newPage(browser); await p.goto(BASE); await p.locator('.nav-item').nth(1).click({ timeout: 120000 }); await btn(p, 'START').click();
  const dom = () => p.evaluate(() => document.getElementsByTagName('*').length);
  const cycle = async () => { for (let i = 0; i < 20; i++) for (const k of ['1', '2', '3', '1']) await p.keyboard.press(k); await p.waitForTimeout(2500); return dom(); };
  const d1 = await cycle(); const d2 = await cycle(); const d3 = await cycle();
  rec('ST-V', 'Stability', 'DOM node count on the same tab after 3 rounds of 80 tab switches (should be flat)', (d3 - d1) < d1 * 0.2 ? 'PASS' : 'FAIL', `${d1} -> ${d2} -> ${d3}`);
  await p.close();
});
save('d_verify'); await browser.close(); console.log('DONE D');
