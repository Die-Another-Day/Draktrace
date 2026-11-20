import { launch, newPage, BASE } from './lib.mjs';
const b = await launch();
const shot = async (p, n, full) => { try { await p.screenshot({ path: `/home/claude/work/qa/shots/${n}.png`, animations: 'disabled', fullPage: !!full, timeout: 150000 }); console.log('ok', n); } catch (e) { console.log('FAIL', n, e.message.split('\n')[0]); } };
try {
  const m = await newPage(b, { viewport: { width: 375, height: 812 }, reducedMotion: 'reduce' }); await m.goto(BASE); await m.waitForSelector('.cc-grid', { timeout: 120000 }); await m.waitForTimeout(2500);
  await m.locator('.cc-grid').scrollIntoViewIfNeeded(); await shot(m, '07_fixed_375_command_center_one_column');
  await m.locator('.dt-tip').first().scrollIntoViewIfNeeded(); await m.locator('.dt-tip').first().hover(); await m.waitForTimeout(600); await shot(m, '08_fixed_375_tooltip_inside_screen');
  await m.close();
  const t = await newPage(b, { viewport: { width: 1024, height: 768 }, reducedMotion: 'reduce' }); await t.goto(BASE); await t.waitForSelector('.cc-crawlers', { timeout: 120000 }); await t.waitForTimeout(2000);
  await t.locator('.cc-crawlers').scrollIntoViewIfNeeded(); await shot(t, '09_fixed_1024_crawlers_full_row');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); }
await b.close(); console.log('DONE Q');
