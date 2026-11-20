// Chart series computed from the live threat list and fleet, so charts move with the simulation.
import { useMemo } from 'react';
import { useThreats, useFleet } from '../context/CrawlerContext';
import { crawlingActivityBase } from '../mock/commandCenter';
import { bucketCounts, cumulativeTrend, clockLabel, weekdayLabels, useMinute, HOUR } from '../mock/timeline';

/** Threats over the last 24 h in `n` buckets, plus per-severity and cumulative series for the sparklines. */
export function useThreatSeries(n = 8) {
  const { stamps } = useThreats();
  const minute = useMinute();
  return useMemo(() => {
    void minute; // re-evaluate once a minute so the buckets slide forward even when no threat arrives
    const nowMs = Date.now();
    const bucketMs = (24 * HOUR) / n;
    const all = stamps.map((s) => s[0]);
    const values = bucketCounts(all, nowMs, n, bucketMs);
    const labels = values.map((_, i) => clockLabel(nowMs - (n - i) * bucketMs));
    const bySeverity = {};
    for (const k of ['critical', 'high', 'medium', 'low']) {
      bySeverity[k] = bucketCounts(stamps.filter((s) => s[1] === k).map((s) => s[0]), nowMs, 8, 3 * HOUR);
    }
    return {
      labels,
      values,
      bySeverity,
      total8: bucketCounts(all, nowMs, 8, 3 * HOUR),
      cumulative: cumulativeTrend(all, nowMs, 10, 24 * HOUR),
    };
  }, [stamps, minute, n]);
}

/** Pages crawled per day for the last 7 days. Today's bar grows with what the running crawlers fetch. */
export function useCrawlingActivity() {
  const { pagesTotal, seedPages } = useFleet();
  const minute = useMinute();
  return useMemo(() => {
    const values = [...crawlingActivityBase];
    values[values.length - 1] += Math.max(0, pagesTotal - seedPages);
    return { labels: weekdayLabels(minute), values };
  }, [pagesTotal, seedPages, minute]);
}
