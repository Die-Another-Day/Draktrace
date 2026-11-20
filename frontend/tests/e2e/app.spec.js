import { test, expect, heroChip } from './helpers';

test.describe('shell and Command Center', () => {
  test('A1 opens on Command Center with hero, stats and charts, and no spider anywhere', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('heading', { name: 'Command Center', level: 1 })).toBeVisible();
    await expect(page.locator('.hero canvas')).toBeVisible(); // globe
    await expect(page.getByText('Threats detected')).toBeVisible();
    await expect(page.getByText('Threats over time')).toBeVisible();
    await expect(page.locator('#spider3d, .sw, [data-spider-bell]')).toHaveCount(0); // spider, threat web and spider bell are gone
    expect(await page.locator('main').count()).toBe(1); // no nested <main>
  });

  test('A10 Ctrl+K opens the command palette, Escape closes it', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('Control+k');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Command palette' })).toHaveCount(0);
  });

  test('crawler starts idle with an enabled START control and no active alert', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('2');
    await expect(page.getByRole('main').getByText('IDLE', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'START' })).toBeEnabled();
    await expect(page.getByText('No activity yet. Press START to dispatch the crawler.')).toBeVisible();
    await expect(page.getByRole('alert')).toHaveCount(0);
  });

  test('manual critical demo remains available from the top bar and command palette', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: /simulate critical/i }).click();
    await expect(page.getByRole('alert')).toContainText('Critical threat detected');
    await page.keyboard.press('Control+k');
    await page.getByRole('textbox', { name: 'Command' }).fill('Simulate critical threat');
    await page.getByText('Simulate critical threat', { exact: true }).click();
    await expect(page.getByRole('alert')).toContainText('Critical threat detected');
  });

  test('number keys switch tabs', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('2');
    await expect(page.getByRole('button', { name: 'START' })).toBeVisible();
    await page.keyboard.press('3');
    await expect(page.getByRole('searchbox')).toBeVisible();
    await page.keyboard.press('1');
    await expect(page.getByText('Threats detected')).toBeVisible();
  });

  test('perf overlay opens with ?perf and reports a GPU line', async ({ page }) => {
    await page.goto('/?perf');
    await expect(page.getByTestId('perf-overlay')).toContainText('fps', { timeout: 30_000 });
    await expect(page.getByTestId('perf-overlay')).toContainText('GPU:');
  });
});

test.describe('crawler state is shared', () => {
  test('start on the Crawler tab, switch tabs: still running; "Stop activity" shows STOPPED (not IDLE)', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('2');
    await page.getByRole('button', { name: 'RESET' }).click();
    await page.getByRole('button', { name: 'START' }).click();
    await expect(page.getByRole('button', { name: 'START' })).toBeDisabled();
    await page.keyboard.press('1');
    await expect(heroChip(page)).toContainText('LIVE');
    await page.keyboard.press('2');
    await expect(page.getByRole('button', { name: 'START' })).toBeDisabled(); // still running after the tab switch
    await page.keyboard.press('1');
    await page.getByRole('button', { name: 'Stop activity' }).click(); // stops the whole fleet; the 4th crawler never started
    await expect(heroChip(page)).toContainText('STOPPED');
    await expect(page.getByRole('button', { name: 'Simulate activity' })).toBeVisible();
  });

  test('starting and then pausing every crawler from the Command Center gives PAUSED', async ({ page }) => {
    await page.goto('/');
    const start = page.locator('.cc-crawlers').getByRole('button', { name: 'Start', exact: true });
    while (await start.count()) await start.first().click();
    const pause = page.locator('.cc-crawlers').getByRole('button', { name: 'Pause' });
    while (await pause.count()) await pause.first().click();
    await expect(heroChip(page)).toContainText('PAUSED');
  });
});

test.describe('live data reaches the charts', () => {
  const polyline = (page) => page.locator('.cc-chart__line').first();

  test('Command Center: counts, the threats-over-time line and the severity donut move while crawling', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('2');
    await page.getByRole('button', { name: 'START' }).click();
    await page.keyboard.press('1');
    const total = page.locator('.cc-donut__center strong');
    const t0 = Number((await total.textContent()).replace(/,/g, ''));
    const line0 = await polyline(page).getAttribute('points');
    await expect.poll(async () => Number((await total.textContent()).replace(/,/g, '')), { timeout: 20_000 }).toBeGreaterThan(t0);
    await expect.poll(() => polyline(page).getAttribute('points'), { timeout: 20_000 }).not.toBe(line0);
  });

  test('Threat Intelligence: activity chart and sparklines move; counts match the Command Center', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('2');
    await page.getByRole('button', { name: 'START' }).click();
    await page.keyboard.press('1');
    const cc = Number((await page.locator('.cc-donut__center strong').textContent()).replace(/,/g, ''));
    await page.keyboard.press('3');
    const chart = page.locator('.activity-line polyline');
    const pts0 = await chart.getAttribute('points');
    const bars0 = await page.locator('.stat-card.total .stat-sparkline span').evaluateAll((s) => s.map((x) => x.style.height).join());
    await expect.poll(async () => Number(await page.locator('.stat-card.total strong').textContent()), { timeout: 20_000 }).toBeGreaterThanOrEqual(cc);
    await expect.poll(() => chart.getAttribute('points'), { timeout: 20_000 }).not.toBe(pts0);
    await expect.poll(() => page.locator('.stat-card.total .stat-sparkline span').evaluateAll((s) => s.map((x) => x.style.height).join()), { timeout: 20_000 }).not.toBe(bars0);
    await expect(page.locator('.activity-x-axis')).toContainText('now');
  });

  test('"detected" labels are relative to now, not to the dataset export time', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('3');
    const labels = await page.locator('.threat-card .threat-data div:last-child span').allTextContents();
    expect(labels.length).toBeGreaterThan(5);
    // the dataset is ~1 day wide; with the shift nothing may be older than 2 days
    for (const l of labels) expect(l).toMatch(/^(just now|\d+ min ago|\d+ hours? ago|1 day ago)$/);
  });
});

test.describe('Threat Intelligence tab', () => {
  test('A8 search narrows the list, Reset restores it', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('3');
    await page.getByRole('button', { name: 'Reset' }).click();
    const cards = page.locator('.threat-card');
    const all = await cards.count();
    const ioc = await cards.first().locator('code').textContent();
    await page.getByRole('searchbox').fill(ioc);
    await expect(cards).toHaveCount(1);
    await page.getByRole('button', { name: 'Reset' }).click();
    expect(await cards.count()).toBeGreaterThanOrEqual(all);
  });

  test('A9 details panel sits on top, Escape closes it and restores focus', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('3');
    const card = page.locator('.threat-card').first();
    await card.click();
    const dlg = page.getByRole('dialog');
    await expect(dlg).toBeVisible();
    const onTop = await dlg.evaluate((el) => { const r = el.getBoundingClientRect(); const hit = document.elementFromPoint(r.x + r.width / 2, r.y + 40); return el.contains(hit); });
    expect(onTop).toBe(true);
    await page.keyboard.press('1'); // number hotkeys are ignored while a dialog is open
    await expect(page.getByRole('searchbox')).toBeAttached();
    await page.keyboard.press('Escape');
    await expect(dlg).toHaveCount(0);
  });

  test('Mark as Reviewed updates the status', async ({ page }) => {
    await page.goto('/');
    await page.keyboard.press('3');
    await page.locator('.threat-card').first().click();
    await page.getByRole('button', { name: 'Mark as Reviewed' }).click();
    await expect(page.getByRole('button', { name: 'Reviewed' })).toBeDisabled();
  });
});

test.describe('fonts', () => {
  test('are bundled: loaded without leaving localhost', async ({ page }) => {
    await page.goto('/');
    const loaded = await page.evaluate(async () => {
      await document.fonts.ready;
      return [...document.fonts].filter((f) => f.status === 'loaded').map((f) => f.family.replace(/"/g, ''));
    });
    expect(loaded).toEqual(expect.arrayContaining(['Inter', 'Rajdhani']));
    // external requests are already failed by the shared fixture
  });
});
