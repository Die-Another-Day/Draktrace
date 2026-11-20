import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, cleanup } from '@testing-library/react';
import { CrawlerProvider, progressOf, useCrawlerStatus, useFleet, useThreats, useFeed, useHistory } from './CrawlerContext';
import { useThreatSeries, useCrawlingActivity } from '../hooks/useLiveCharts';
import statistics from '../mock-data/statistics.json';
import crawlersJson from '../mock-data/crawlers.json';
import { eventBus } from '../hooks/eventBus';

afterEach(() => { cleanup(); vi.useRealTimers(); vi.restoreAllMocks(); });

function setup() {
  return renderHook(
    () => ({
      status: useCrawlerStatus(), fleet: useFleet(), threats: useThreats(), feed: useFeed(), history: useHistory(),
      series: useThreatSeries(8), activity: useCrawlingActivity(),
    }),
    { wrapper: CrawlerProvider }
  );
}

describe('crawler status', () => {
  it('starts idle with 40 seed threats and matching severity counts', () => {
    const { result } = setup();
    expect(result.current.status.status).toBe('idle');
    expect(result.current.fleet.runningCount).toBe(0);
    expect(result.current.fleet.fleet.every((c) => c.status === 'idle')).toBe(true);
    expect(crawlersJson.every((c) => c.status === 'idle')).toBe(true);
    expect(result.current.threats.totalThreats).toBe(statistics.threats.total);
    expect(result.current.threats.sev).toEqual(statistics.severity);
  });

  it('does not crawl, add feed records or fire critical alerts before START', () => {
    vi.useFakeTimers();
    const { result } = setup();
    const before = {
      pages: result.current.fleet.pagesTotal,
      events: result.current.feed.events.length,
      threats: result.current.threats.totalThreats,
      logs: result.current.fleet.logs.length,
    };
    const criticals = [];
    const off = eventBus.on(({ type, payload }) => {
      if (type === 'critical') criticals.push(payload);
    });

    try {
      act(() => { vi.advanceTimersByTime(60_000); });

      expect(result.current.fleet.pagesTotal).toBe(before.pages);
      expect(result.current.feed.events).toHaveLength(before.events);
      expect(result.current.threats.totalThreats).toBe(before.threats);
      expect(result.current.fleet.logs).toHaveLength(0);
      expect(criticals).toHaveLength(0);
    } finally {
      off();
    }
  });

  it('shows "stopped" after starting and then stopping the whole fleet', () => {
    const { result } = setup();
    act(() => result.current.status.command('start'));
    act(() => result.current.status.command('stop'));
    expect(result.current.status.status).toBe('stopped');
  });

  it('start -> running -> paused -> running -> idle on reset', () => {
    const { result } = setup();
    act(() => result.current.status.command('start'));
    expect(result.current.status.status).toBe('running');
    act(() => result.current.status.command('pause'));
    expect(result.current.status.status).toBe('paused');
    act(() => result.current.status.command('start'));
    expect(result.current.status.status).toBe('running');
    act(() => result.current.status.command('reset'));
    expect(result.current.status.status).toBe('idle');
    expect(result.current.fleet.pagesTotal).toBe(0);
  });

  it('reset sends the progress bar back to 0% for every crawler, and a reset crawler can climb again', () => {
    vi.useFakeTimers();
    const { result } = setup();
    expect(progressOf(result.current.fleet.primary)).toBeGreaterThan(0); // seeded mid-crawl
    act(() => result.current.status.command('reset'));
    for (const c of result.current.fleet.fleet) {
      expect(c.pagesCrawled).toBe(0);
      expect(progressOf(c)).toBe(0);
      expect(c.status).toBe('idle');
    }
    act(() => result.current.status.command('start'));
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.fleet.primary.pagesCrawled).toBeGreaterThan(0);
    expect(progressOf(result.current.fleet.primary)).toBeGreaterThan(0);
  });

  it('resetting one crawler leaves the others where they are', () => {
    const { result } = setup();
    const [first, second] = result.current.fleet.fleet;
    act(() => result.current.status.command('reset', first.id));
    expect(result.current.fleet.fleet[0].pagesCrawled).toBe(0);
    expect(result.current.fleet.fleet[1].pagesCrawled).toBe(second.pagesCrawled);
  });
});

describe('automatic critical alert cooldown', () => {
  it('limits automatic critical flashes to about 20 seconds but leaves manual triggers immediate', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0); // activityPool[0] is critical on each feed tick
    const criticals = [];
    const off = eventBus.on(({ type, payload }) => {
      if (type === 'critical') criticals.push(payload);
    });
    const { result } = setup();

    try {
      act(() => result.current.status.command('start'));
      act(() => { vi.advanceTimersByTime(10_000); });
      expect(criticals).toHaveLength(1);

      act(() => eventBus.emit('critical', { title: 'Manual demo critical' }));
      expect(criticals).toHaveLength(2);
      expect(criticals[1].title).toBe('Manual demo critical');

      act(() => { vi.advanceTimersByTime(11_999); });
      expect(criticals).toHaveLength(2);
      act(() => { vi.advanceTimersByTime(501); });
      expect(criticals).toHaveLength(3);
    } finally {
      off();
    }
  });
});

describe('live charts', () => {
  it('new simulated threats show up in the totals, the last time bucket and the cumulative sparkline', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.status.command('start'));
    const before = {
      total: result.current.threats.totalThreats,
      last: result.current.series.values.at(-1),
      sum: result.current.series.values.reduce((a, b) => a + b, 0),
    };
    expect(before.sum).toBe(before.total); // all 40 seed threats are inside the 24 h window
    act(() => { vi.advanceTimersByTime(2500 * 6); });
    const after = result.current;
    expect(after.threats.totalThreats).toBeGreaterThan(before.total);
    expect(after.series.values.at(-1)).toBeGreaterThan(before.last);
    expect(after.series.cumulative.at(-1)).toBe(after.threats.totalThreats);
    expect(after.series.values.reduce((a, b) => a + b, 0)).toBe(after.threats.totalThreats);
    // per-severity series add up to the severity counters
    for (const k of ['critical', 'high', 'medium', 'low']) {
      expect(after.series.bySeverity[k].reduce((a, b) => a + b, 0)).toBe(after.threats.sev[k]);
    }
  });

  it('keeps counting threats after the visible list rolls over (150 max)', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.status.command('start'));
    act(() => { vi.advanceTimersByTime(2500 * 300); }); // routine events are not threats, so passing 150 takes longer
    expect(result.current.threats.threats.length).toBe(150);
    expect(result.current.threats.totalThreats).toBeGreaterThan(150);
    expect(result.current.series.values.reduce((a, b) => a + b, 0)).toBe(result.current.threats.totalThreats);
  });

  it("today's crawling bar and the pages sparkline grow while crawlers run", () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.status.command('start'));
    const bar = result.current.activity.values.at(-1);
    const spark = result.current.history.pages.at(-1);
    act(() => { vi.advanceTimersByTime(5000); });
    expect(result.current.activity.values.at(-1)).toBeGreaterThan(bar);
    expect(result.current.history.pages.at(-1)).toBeGreaterThan(spark);
    expect(result.current.history.pages).toHaveLength(10);
  });

  it('the threat level follows the severity mix and starts at the dataset value', () => {
    const { result } = setup();
    expect(result.current.threats.threatLevel).toBe(statistics.threatLevel);
  });

  it('no live data when everything is stopped', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.status.command('start'));
    act(() => result.current.status.command('stop'));
    const total = result.current.threats.totalThreats;
    act(() => { vi.advanceTimersByTime(20000); });
    expect(result.current.threats.totalThreats).toBe(total);
  });
});

describe('live feed rules', () => {
  it('routine status lines (no findings, slow source) never become threats', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.status.command('start'));
    act(() => { vi.advanceTimersByTime(5 * 60 * 1000); });
    const names = new Set(result.current.threats.threats.map((t) => t.name));
    expect(names.has('Crawl batch finished with no new findings')).toBe(false);
    expect(names.has('Source responded slowly, retry succeeded')).toBe(false);
  });
  it('the threat list stops at 150 while the total keeps counting', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.status.command('start'));
    act(() => { vi.advanceTimersByTime(12 * 60 * 1000); });
    expect(result.current.threats.threats).toHaveLength(150);
    expect(result.current.threats.totalThreats).toBeGreaterThan(150);
  });
});
