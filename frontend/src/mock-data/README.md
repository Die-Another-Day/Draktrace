# DarkTrace mock data

All values are fake placeholders. `.onion` hosts start with `demo`, IPs are from the reserved documentation ranges
(192.0.2.x, 198.51.100.x, 203.0.113.x) and domains/emails use `.example`. No real address or site appears.
The fixtures share consistent totals, severity counts, page metrics and source ids. All crawler fixture statuses are `idle` so the demo waits for an explicit START command before simulating activity.

Common values
- severity: `critical` | `high` | `medium` | `low`
- crawler status: `running` | `paused` | `stopped` | `idle`   (same names as Ateeb's Badge)
- source status: `online` | `offline`
- timestamps: ISO 8601 UTC, e.g. `2026-10-07T09:46:00Z`. `src/mock/timeline.js` shifts them so the dataset's export time (`statistics.generatedAt`) becomes the moment the app opens; the UI shows "5 min ago" from there and keeps counting

| File | Used by | Contents |
|---|---|---|
| `statistics.json` | Command Center | `threats`, `sources`, `pages`, `crawlers` each with a total, `deltaPct` and a `trend` array for the sparkline; `severity` counts; `threatLevel` (0-100) |
| `crawlers.json` | Crawler tab, Command Center | per crawler: `id`, `name`, `status`, `source {id,name,url}`, `pagesCrawled`, `pagesDiscovered`, `progress` (0-100), `speed` (1/2/5), `throughputPerMin`, `latencyMs`, `circuit`. Himanshu's tab uses the first entry. |
| `sources.json` | Command Center, charts | `id`, `name`, `type` (marketplace, forum, leak-site, paste-site, chat-channel), `url`, `status`, `lastCrawled`, `pagesCrawled`, `threatsFound` |
| `threats.json` | Threat Intelligence tab | `id`, `title`, `severity`, `category` (ransomware, credential-theft, phishing, malware, data-leak, exploit), `iocType` (domain, ip, hash, url, email), `ioc`, `source {id,name}`, `detectedAt`, `confidence`, `description`, `tags`. Sorted newest first. |
| `activity.json` | Command Center feed | `id`, `time`, `level` (`info`/`success`/`warn`/`error`, matches LogFeed), `severity` (or `system`), `text`. Newest first. |
| `charts.json` | Manpreet's charts | `threatsOverTime` (3-hour buckets), `threatCategories`, `severityDistribution`, `crawlingActivity` (pages per day), `sourceActivity` (pages and threats per source) |

`src/mock/commandCenter.js` is a small adapter that reshapes these for the Command Center page.
