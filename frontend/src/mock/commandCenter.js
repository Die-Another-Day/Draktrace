// Command Center data adapter. Every number comes from src/mock-data/*.json so the three tabs agree.
// (Live changes during the simulation are handled by context/CrawlerContext.jsx.)
import statistics from '../mock-data/statistics.json';
import crawlersJson from '../mock-data/crawlers.json';
import activityJson from '../mock-data/activity.json';
import charts from '../mock-data/charts.json';

export const stats = {
  threats: { delta: statistics.threats.deltaPct, trend: statistics.threats.trend },
  sources: { value: statistics.sources.monitored, delta: statistics.sources.deltaPct, trend: statistics.sources.trend },
  pages: { delta: statistics.pages.deltaPct, trend: statistics.pages.trend },
  crawlers: { delta: statistics.crawlers.deltaPct, trend: statistics.crawlers.trend },
};

export const threatLevel = statistics.threatLevel; // 0-100, drives the gauge

export const crawlers = crawlersJson;

// activity.json is newest first; the feed reads top to bottom, oldest first
export const activitySeed = [...activityJson].reverse();

// Extra messages used by the live simulation
export const activityPool = [
  { severity: 'critical', level: 'error',   text: 'Zero-day exploit offered for sale on a marketplace' },
  { severity: 'high',     level: 'warn',    text: 'Leaked database sample posted (employee records)' },
  { severity: 'medium',   level: 'info',    text: 'Suspicious file hash added to indicator list' },
  { severity: 'medium',   level: 'info',    text: 'New malware builder advertised on a forum' },
  { severity: 'low',      level: 'success', text: 'Crawl batch finished with no new findings', finding: false },
  { severity: 'low',      level: 'info',    text: 'Source responded slowly, retry succeeded', finding: false },
];

// Baselines for the live charts (see hooks/useLiveCharts.js). The charts add what the simulation does on top of these.
export const crawlingActivityBase = charts.crawlingActivity.values; // pages per day, last value = today at export time
export const seedThreatTotal = statistics.threats.total;
export const seedSeverity = statistics.severity;
export const seedPagesTrend = statistics.pages.trend;
export const seedCrawlersTrend = statistics.crawlers.trend;
export const seedSourcesTrend = statistics.sources.trend;

// Threat categories and per-source activity (the other two dashboard charts). Both are baselines; the context adds live counts.
export const seedCategories = charts.threatCategories.labels.map((l, i) => [l, charts.threatCategories.values[i]]);
export const THREAT_CATEGORIES = charts.threatCategories.labels;
export const seedSourceActivity = charts.sourceActivity.labels.map((label, i) => ({
  label,
  pages: charts.sourceActivity.pagesCrawled[i],
  threats: charts.sourceActivity.threatsFound[i],
}));
