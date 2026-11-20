# DarkTrace — Integration 

This guide describes the current integrated frontend. The app uses local mock data and a controllable browser-side simulation; it does not crawl real external systems.

## 1. Run, build and test

```bash
npm install
npm run dev            # http://localhost:5173
npm run build          # production bundle -> dist/
npm run build:single   # standalone bundle -> dist-single/index.html
npm test               # Vitest unit and React integration tests
npm run test:e2e       # Playwright browser tests
```

Requires Node 22.12 or newer. For the browser tests, install Chromium once with `npx playwright install chromium`. Firefox/WebKit are optional and can be enabled with `PW_ALL_BROWSERS=1` after installing those browser engines.

Navigate by clicking the sidebar, pressing `1`, `2`, or `3`, or using `Ctrl/⌘+K` to open the command palette. Add `?perf` to the URL (or press `Alt+P`) for the performance overlay.

## 2. Data and state flow

```text
src/mock-data/*.json
       ↓
src/mock/*.js  (data adapters and timestamp shifting)
       ↓
src/context/CrawlerContext.jsx  (shared fleet, crawl simulation, feed and threats)
       ├─ hooks/useLiveCharts.js
       ├─ modules/CommandCenter
       ├─ modules/DarkWebCrawler
       └─ modules/ThreatIntelligence

src/context/AppContext.jsx → shared navigation and visual-effect events
src/hooks/eventBus.js       → critical alert, crawler state and tab events
```

The `CrawlerContext` is the single source of truth, so crawler state and live counts persist when switching tabs. Its main hooks are `useCrawlerStatus()`, `useFleet()`, `useFeed()`, `useThreats()`, `useHistory()` and `useSourceActivity()`.

The fleet initializes with every crawler in `idle`. The Crawler tab's `START`, `PAUSE`, `STOP` and `RESET` controls act on the primary crawler; Command Center crawler cards control individual crawlers, and the hero control starts/stops the fleet. Crawl steps, simulated feed entries, and newly generated threat records run only when at least one crawler is running. The Crawler tab begins with an empty terminal so pressing `START` has an immediate visible result.

Automatic critical findings can still enter the mock threat list, but the associated screen-flash event is limited to one per 20 seconds. The cooldown only gates automatic flash events. The top-bar **Simulate critical** action and the equivalent command-palette command emit directly and remain immediate, even during the cooldown.

The mock data is intentionally seeded with historical threat records and chart baselines. Those records are shown at startup but do not themselves fire alert animations. New simulated records update the relevant totals and live chart series. All sample targets and values are placeholders; no real targets are crawled.

## 3. Main folders

```text
src/
  components/charts/       lightweight SVG charts
  components/effects/      backdrop, digital rain, globe, command palette and interactions
  components/layout/       sidebar, top bar and icons
  components/ui/           shared buttons, cards, badges, log feed, dialogs and telemetry UI
  context/                 app shell state and shared crawler simulation
  hooks/                   event bus, chart series and UI/performance hooks
  mock/                    adapters, seeded threats and timeline helpers
  mock-data/               JSON fixtures used by all three modules
  modules/CommandCenter/   dashboard, crawler cards, activity and charts
  modules/DarkWebCrawler/  primary crawler controls and terminal
  modules/ThreatIntelligence/ threat search, filters and details
  pages/                   shared page wrappers
  styles/                  global tokens and integration CSS
  tests/e2e/               Playwright tests
```
