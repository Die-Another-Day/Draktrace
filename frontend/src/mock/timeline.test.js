import { describe, it, expect } from 'vitest';
import { bucketCounts, cumulativeTrend, timeAgo, shiftIso, SHIFT, SESSION_START, weekdayLabels, DAY, HOUR, MIN } from './timeline';
import statistics from '../mock-data/statistics.json';
import threatsJson from '../mock-data/threats.json';
import charts from '../mock-data/charts.json';

describe('bucketCounts', () => {
  const now = 1_000_000_000;
  it('puts events in the right bucket and ignores out-of-range ones', () => {
    const times = [now, now - 1, now - HOUR - 1, now - 3 * HOUR + 1, now - 3 * HOUR, now + 5];
    // 3 buckets of 1 h: (now-3h, now-2h], (now-2h, now-1h], (now-1h, now]
    expect(bucketCounts(times, now, 3, HOUR)).toEqual([1, 1, 2]);
  });
  it('returns zeros for no data', () => expect(bucketCounts([], now, 4, HOUR)).toEqual([0, 0, 0, 0]));
});

describe('cumulativeTrend', () => {
  it('is non-decreasing and ends at the total', () => {
    const now = 10 * DAY;
    const times = [now - 23 * HOUR, now - 12 * HOUR, now - 1 * HOUR, now];
    const t = cumulativeTrend(times, now, 10, DAY);
    expect(t).toHaveLength(10);
    expect(t.at(-1)).toBe(4);
    for (let i = 1; i < t.length; i += 1) expect(t[i]).toBeGreaterThanOrEqual(t[i - 1]);
  });
});

describe('timeAgo', () => {
  it.each([
    [0, 'just now'], [29 * 1000, 'just now'], [5 * MIN, '5 min ago'], [60 * MIN, '1 hour ago'],
    [3 * HOUR, '3 hours ago'], [2 * DAY, '2 days ago'], [-5000, 'just now'],
  ])('%i ms -> %s', (ms, label) => expect(timeAgo(ms)).toBe(label));
});

describe('dataset time shift', () => {
  it('keeps the newest threat as old as it was at export time', () => {
    const newest = Math.max(...threatsJson.map((t) => Date.parse(t.detectedAt)));
    const ageAtExport = Date.parse(statistics.generatedAt) - newest;
    const ageNow = SESSION_START - Date.parse(shiftIso(new Date(newest).toISOString()));
    expect(ageNow).toBe(ageAtExport);
    expect(SHIFT).toBe(SESSION_START - Date.parse(statistics.generatedAt));
  });
  it('weekday labels end today and have 7 entries', () => {
    const l = weekdayLabels(Date.now());
    expect(l).toHaveLength(7);
    expect(l.at(-1)).toBe(new Date().toLocaleDateString([], { weekday: 'short' }));
  });
});

describe('mock data stays consistent', () => {
  it('threat totals match', () => {
    expect(threatsJson).toHaveLength(statistics.threats.total);
    const sev = { critical: 0, high: 0, medium: 0, low: 0 };
    threatsJson.forEach((t) => { sev[t.severity] += 1; });
    expect(sev).toEqual(statistics.severity);
    expect(charts.severityDistribution).toEqual(statistics.severity);
  });
  it('every threat falls inside the 24 h chart window at export time', () => {
    const gen = Date.parse(statistics.generatedAt);
    const inWindow = threatsJson.filter((t) => gen - Date.parse(t.detectedAt) <= DAY);
    expect(bucketCounts(inWindow.map((t) => Date.parse(t.detectedAt)), gen, 8, 3 * HOUR).reduce((a, b) => a + b, 0)).toBe(inWindow.length);
  });
});
