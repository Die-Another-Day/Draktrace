import { launch, newPage, BASE } from './lib.mjs';
const b = await launch(); const p = await newPage(b, { reducedMotion: 'reduce' }); await p.goto(BASE); await p.waitForSelector('.sidebar', { timeout: 120000 });
for (const [w, h] of [[1440, 900], [768, 1024], [375, 812]]) {
  await p.setViewportSize({ width: w, height: h }); await p.waitForTimeout(900);
  const r = await p.evaluate(() => { const f = (s) => { const e = document.querySelector(s); if (!e) return null; const c = getComputedStyle(e); const m = c.backgroundColor.match(/rgba?\(([^)]+)\)/)[1].split(',').map(parseFloat); return { a: m.length === 4 ? m[3] : 1, blur: c.backdropFilter, bgImg: c.backgroundImage.slice(0, 60), pos: c.position, z: c.zIndex }; }; return { sidebar: f('.sidebar'), topbar: f('.topbar'), ticker: f('.ticker') }; });
  console.log(w, JSON.stringify(r));
}
await b.close();
