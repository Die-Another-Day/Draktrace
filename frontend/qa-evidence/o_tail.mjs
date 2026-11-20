import { launch, newPage, rec, save, tab, btn, BASE } from './lib.mjs';
const browser = await launch();
const safe = async (id, area, name, fn) => { try { await fn(); } catch (e) { rec(id, area, name, 'ERROR', String(e.message).split('\n')[0].slice(0, 200)); } };
const badgeOf = (p) => p.locator('text=/● (IDLE|RUNNING|PAUSED|STOPPED)/').first().textContent();
const metric = async (p, title) => +(await p.locator(`text=${title}`).locator('xpath=following-sibling::div[1]').textContent()).replace(/,/g, '');

const cardsOf = (p) => p.locator('.threat-card');
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

save('o_tail');
await browser.close();
console.log('DONE O');
