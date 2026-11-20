// Time helpers shared by the charts, the stat sparklines and the "5 min ago" labels.
//
// The dataset was exported at statistics.generatedAt. All its timestamps are shifted by (app start - export time),
// so a threat that was "5 min old" at export is 5 min old when you open the app, and the charts always end at "now".
import { useSyncExternalStore } from 'react';
import statistics from '../mock-data/statistics.json';

export const SESSION_START = Date.now();
export const SHIFT = SESSION_START - Date.parse(statistics.generatedAt);
export const shiftIso = (iso) => new Date(Date.parse(iso) + SHIFT).toISOString();

export const MIN = 60000;
export const HOUR = 3600000;
export const DAY = 86400000;

export function timeAgo(ms) {
  const min = Math.max(0, Math.round(ms / MIN));
  if (min < 1) return 'just now';
  if (min < 60) return `${min} min ago`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} hour${h === 1 ? '' : 's'} ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? '' : 's'} ago`;
}

/** Events per bucket. Bucket i covers (now - (n-i)*bucketMs, now - (n-i-1)*bucketMs]; the last bucket ends at `now`. */
export function bucketCounts(times, now, n, bucketMs) {
  const out = new Array(n).fill(0);
  const start = now - n * bucketMs;
  for (const t of times) {
    if (t <= start || t > now) continue;
    out[Math.min(n - 1, Math.floor((t - start - 1) / bucketMs))] += 1;
  }
  return out;
}

/** Running total sampled at `points` evenly spaced moments over `spanMs`, the last one being `now`. */
export function cumulativeTrend(times, now, points, spanMs) {
  const step = spanMs / (points - 1);
  return Array.from({ length: points }, (_, i) => {
    const at = now - (points - 1 - i) * step;
    let c = 0;
    for (const t of times) if (t <= at) c += 1;
    return c;
  });
}

export const clockLabel = (ms) => new Date(ms).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', hour12: false });
export const weekdayLabels = (now, n = 7) =>
  Array.from({ length: n }, (_, i) => new Date(now - (n - 1 - i) * DAY).toLocaleDateString([], { weekday: 'short' }));

/* ---- a clock that ticks once a minute, shared by every component that shows a relative time ---- */
const listeners = new Set();
let timer = 0;
const subscribe = (fn) => {
  listeners.add(fn);
  if (!timer) timer = setInterval(() => listeners.forEach((l) => l()), 15000); // re-check often, re-render only when the minute changes
  return () => {
    listeners.delete(fn);
    if (!listeners.size) { clearInterval(timer); timer = 0; }
  };
};
const snapshot = () => Math.floor(Date.now() / MIN) * MIN;
export const useMinute = () => useSyncExternalStore(subscribe, snapshot, snapshot);
