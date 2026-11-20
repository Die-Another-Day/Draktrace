# DarkTrace — Base Frontend

See `INTEGRATION_GUIDE.md` for how the modules, data and tests fit together.

## Run

```bash
npm install
npm run dev        # http://localhost:5173
npm run build      # production build -> dist/
npm test           # unit tests
npm run test:e2e   # browser tests
```

Add `?perf` to the URL (or press Alt+P) for an fps and GPU readout.

Requires Node 22.12+ (Vite 8 needs 20.19+, Vitest 5 needs 22.12+).

## What's included

- **Layout:** fixed sidebar and sticky top bar with a live telemetry ticker. On tablets the sidebar becomes an icon rail; on phones it becomes a bottom tab bar.
- **Navigation:** Command Center, Dark Web Crawler and Threat Intelligence. Keys `1` / `2` / `3` also switch tabs.
- **Controllable crawler demo:** the fleet starts `IDLE` with no synthetic terminal activity. `START` begins the crawl/feed simulation. Automatic critical flashes are throttled to at most one every 20 seconds; the top-bar and command-palette demo triggers bypass that cooldown.
- **Global theme:** `src/styles/global.css` holds the color tokens (cyan accent, severity colors), fonts, the glass `.card` panel, page header and grid helpers.
- **Page structure:** every tab uses the shared `PageHeader` (decrypt-in title, glitch flicker) above its own module.

## 3D + hacker theme

**3D**

- **Holographic globe** (Command Center hero): a canvas globe of the 8 collector regions with data packets flying along arcs.
  - Drag it to rotate (it keeps spinning with inertia); hover a node to see its label.
  - It spins faster while the crawler is active and turns red on a critical alert.
- **3D cube logo:** a glass cube in the sidebar that turns to follow the mouse and spins when clicked.
- **3D tilt panels:** panels tilt toward the cursor, lift off the page, and get a moving glare plus an edge light.
- **3D scroll reveal:** panels flip up into place as they scroll into view, staggered across each row.
- **Camera parallax:** the perspective grid floor, horizon, grid and light field pan with the mouse, and the rain sits deeper than the UI.
- **Magnetic buttons:** top-bar and hero buttons lean toward the cursor in 3D (any element with `data-magnetic`).

**Hacker theme**

- **Digital rain:** Matrix-style rain where every column spells D-A-R-K-T-R-A-C-E top to bottom, in three depth layers.
  - Glyphs brighten near the cursor, and clicks send a shockwave through the rain.
  - It falls faster while the crawler is active and turns red on critical alerts.
  - The rain icon in the top bar turns it on or off.
- **Target lock:** HUD corner brackets snap around whatever you hover (panels, buttons, nav), labelled "TARGET LOCK" on panels.
- **Boot sequence:** a terminal-style start-up screen on the first load of a session. Click or press any key to skip.
- **Command palette:** `Ctrl/⌘ + K` lets you switch tabs, simulate an alert, toggle the rain, simulate crawler activity, or replay the boot sequence.
- **Glitch / decrypt titles:** page titles unscramble when a tab opens and glitch now and then.
- **Cursor and clicks:** a soft light follows the cursor behind the glass, and every click sends out a shockwave ring.
- **Critical alerts:** the screen edges pulse red and a "Critical threat detected" banner drops in. Automatic critical flashes have a 20-second cooldown; manual demo triggers are immediate.

Everything respects `prefers-reduced-motion`. On touch devices the tilt, target lock, magnetic buttons and cursor light are off, and the rain is lighter.

## Structure

```
src/
  main.jsx, App.jsx              app shell, global effects, keyboard shortcuts
  styles/global.css              theme tokens, typography, card, page structure, skeletons
  context/AppContext.jsx         activeTab, rainEnabled, crawlerActive, triggerCritical, command palette
  hooks/eventBus.js              app → canvas effects (critical, crawler, tab)
  hooks/useTilt.js               3D tilt for panels (use it on your own cards too)
  components/
    layout/                      Sidebar, Topbar (+ ticker), Icon, layout.css
    effects/                     Globe, DigitalRain, Backdrop (floor, cursor light, click rings, alert),
                                 Interactions (target lock, magnetic, camera parallax, cube logo),
                                 BootSequence, CommandPalette, ScrambleText, effects.css
  pages/
    PageShell.jsx                PageHeader
    CommandCenter.jsx            includes the globe hero
    DarkWebCrawler.jsx
    ThreatIntelligence.jsx
```



## Hooking app events into the effects

| Event | How to fire it | Reaction |
|---|---|---|
| Crawler running | `setCrawlerActive(true / false)` from `useApp()` | rain falls faster, globe spins faster with more packets |
| Critical threat | `triggerCritical(threat)` from `useApp()` | red edge pulse + banner (shows `threat.title` if given), rain and globe flash red |
| Tab change | `setActiveTab(id)` (already wired) | 3D page entrance, title decrypt |

The **Simulate critical** button in the top bar fires a test critical event.



