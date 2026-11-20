import { launch, newPage, BASE } from './lib.mjs';
const browser = await launch();
const shot = async (p, name) => { try { await p.screenshot({ path: `/home/claude/work/qa/shots/${name}.png`, animations: 'disabled', timeout: 150000 }); console.log('ok', name); } catch (e) { console.log('FAIL', name, e.message.split('\n')[0]); } };
const go = (p, n) => p.locator('.nav-item').nth(n - 1).click({ timeout: 120000 }).then(() => p.waitForTimeout(1500));
try {
  const p = await newPage(browser, { reducedMotion: 'reduce' });
  await p.goto(BASE); await p.waitForSelector('.cc-sev'); await p.waitForTimeout(1500); await shot(p, '01_command_center_idle_fixed');
  await p.getByRole('button', { name: 'Simulate activity' }).click(); await p.waitForTimeout(2500); await shot(p, '02_command_center_live');
  await go(p, 2); await shot(p, '03_crawler_running');
  await go(p, 3); await p.waitForSelector('.threat-card'); await shot(p, '04_threat_intel_live');
  await p.close();
  const m = await newPage(browser, { reducedMotion: 'reduce', viewport: { width: 390, height: 844 } });
  await m.addInitScript(() => { Object.defineProperty(navigator, 'clipboard', { value: { writeText: () => Promise.reject(new Error('denied')) }, configurable: true }); });
  await m.goto(BASE); await go(m, 3); await m.waitForSelector('.threat-card'); await shot(m, '05_threat_intel_mobile_390');
  await m.locator('.threat-card').first().click(); await m.waitForTimeout(800); await m.getByRole('dialog').getByRole('button', { name: 'COPY' }).click(); await m.waitForTimeout(400); await shot(m, '06_modal_copy_failed_mobile');
} catch (e) { console.log('ERR', e.message.split('\n')[0]); }
await browser.close(); console.log('DONE H');
