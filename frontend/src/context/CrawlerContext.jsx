// One source of truth for the crawler fleet, the activity feed and the threat list.
// Before: the Crawler tab, the Command Center and the Threat Intelligence tab each kept their own copy,
// and the Crawler tab's simulation stopped the moment you left it. Now the simulation lives here, so
// every tab, the globe and the rain always see the same state.
//
// Four small contexts so a fast-changing value only re-renders the components that read it:
//   useCrawlerStatus() -> { status, command }                 (changes only on start/pause/stop)
//   useFleet()         -> { fleet, primary, logs, ... }       (changes every crawl step)
//   useFeed()          -> { events, feedLive, setFeedLive }   (changes every ~2.5 s while running)
//   useThreats()       -> { threats, sev, totalThreats, stamps, threatLevel, markReviewed }
//   useHistory()       -> { pages, active }                   (last 10 distinct values, for the stat sparklines)
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import crawlersJson from '../mock-data/crawlers.json';
import sourcesJson from '../mock-data/sources.json';
import { activityPool, activitySeed, threatLevel as seedLevel, seedSeverity, seedPagesTrend, seedCrawlersTrend, seedCategories, seedSourceActivity } from '../mock/commandCenter';
import { seedThreats, makeLiveThreat } from '../mock/threats';
import { eventBus } from '../hooks/eventBus';
import { shiftIso } from '../mock/timeline';

const TICK = 150; // ms, master clock for crawl steps
const FEED_MS = 2500; // ms between simulated feed events
const AUTO_CRITICAL_COOLDOWN_MS = 20_000; // automatic alert flashes only; manual demo triggers bypass this gate
const MAX_LOGS = 100;
const MAX_EVENTS = 60;
const MAX_THREATS = 150; // older ones roll into `archived` so the totals keep counting
const SEVERITIES = ['critical', 'high', 'medium', 'low'];
const WEIGHT = { critical: 4, high: 3, medium: 2, low: 1 };
const HISTORY = 10;
const SRC_FLUSH_MS = 1500; // Source activity chart refresh rate
const weighted = (sev) => {
  const n = SEVERITIES.reduce((a, k) => a + sev[k], 0) || 1;
  return SEVERITIES.reduce((a, k) => a + sev[k] * WEIGHT[k], 0) / n;
};
const SEED_WEIGHT = weighted(seedSeverity);
const CIRCUIT_HOPS = ['7F3A', '91BC', 'A22D', '44EF', '31AA', '88CD', 'E012'];

const LOG_TEMPLATES = [
  { level: 'SCAN', color: '#00d4ff', text: (url) => `Crawling discovered endpoint: ${url.slice(0, 30)}...` },
  { level: 'OK', color: '#00ff9d', text: () => 'HTTP 200 OK received. Socket verified' },
  { level: 'EXTRACT', color: '#a855f7', text: () => `${Math.floor(Math.random() * 18 + 4)} threat indicators & hash digests extracted` },
  { level: 'INDEX', color: '#38bdf8', text: () => 'Following discovered DOM link. Appending to harvest queue' },
  { level: 'SCAN', color: '#00d4ff', text: () => 'Initiating TLS/Onion handshake over Tor circuit' },
];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clock = (d = new Date()) => d.toISOString().slice(11, 19); // UTC, same as the top-bar clock

const seedCrawler = (c) => ({
  id: c.id,
  name: c.name,
  status: c.status,
  source: { name: c.source.name, url: c.source.url },
  pagesCrawled: c.pagesCrawled,
  pagesDiscovered: c.pagesDiscovered,
  speed: c.speed,
  latency: c.latencyMs,
  circuit: c.circuit.split('-').join(' → '),
});
const RESET_TARGET = 100; // pages a crawler "knows about" right after RESET, so the bar starts at 0% and visibly climbs
const SEED_PAGES = crawlersJson.reduce((a, c) => a + c.pagesCrawled, 0);
const SEEDS = new Map(crawlersJson.map((c) => [c.id, seedCrawler(c)]));

export const progressOf = (c) => Math.min(100, Math.round((c.pagesCrawled / (c.pagesDiscovered || 1)) * 100));

// No synthetic startup activity: the terminal stays empty until the user starts a crawler.
const seedLogs = () => [];

const seedEvents = () =>
  activitySeed.map((e) => ({
    id: e.id,
    time: clock(new Date(shiftIso(e.time))), // shifted like the threats, so the newest seed event is as old now as at export
    level: e.level,
    severity: e.severity,
    text: e.text,
  }));

const StatusCtx = createContext(null);
const FleetCtx = createContext(null);
const FeedCtx = createContext(null);
const HistoryCtx = createContext(null);
const ThreatCtx = createContext(null);
const SourceCtx = createContext(null);

export function CrawlerProvider({ children }) {
  const [fleet, setFleet] = useState(() => crawlersJson.map(seedCrawler));
  const [logs, setLogs] = useState(seedLogs);
  const [events, setEvents] = useState(seedEvents);
  const [threats, setThreats] = useState(seedThreats);
  const [archived, setArchived] = useState({ critical: 0, high: 0, medium: 0, low: 0 });
  const [archivedStamps, setArchivedStamps] = useState([]); // [ms, severity] of rolled-off threats, so the time charts keep them
  const [history, setHistory] = useState(() => ({
    pages: seedPagesTrend.map((v) => Math.round((v / seedPagesTrend[seedPagesTrend.length - 1]) * SEED_PAGES)),
    active: [...seedCrawlersTrend.slice(0, -1), crawlersJson.filter((c) => c.status === 'running').length],
  }));
  const [feedLive, setFeedLive] = useState(true);
  const [liveCats, setLiveCats] = useState({}); // live threats per category since load (cumulative, survives the roll-off)
  const [liveSrc, setLiveSrc] = useState({}); // { [source name]: { pages, threats } } added by the running simulation, published at most every SRC_FLUSH_MS
  const srcRef = useRef({}); // the live counters; mutated on every crawl step / threat, flushed to state in batches (keeps the threat list from re-rendering every 150 ms)
  const srcDirty = useRef(false);

  const fleetRef = useRef(fleet);
  const threatsRef = useRef(threats);
  useEffect(() => {
    fleetRef.current = fleet;
  }, [fleet]);
  useEffect(() => {
    threatsRef.current = threats;
  }, [threats]);

  const accRef = useRef({}); // ms accumulated per crawler since its last step (no re-render needed)
  const idRef = useRef(0);
  const lastAutomaticCriticalAtRef = useRef(null);

  const pushLog = useCallback((level, color, text) => {
    setLogs((p) => [...p.slice(-(MAX_LOGS - 1)), { id: `l${++idRef.current}`, time: clock(), level, color, text }]);
  }, []);
  const pushEvent = useCallback((text, level = 'info', severity = 'system') => {
    setEvents((p) => [...p.slice(-(MAX_EVENTS - 1)), { id: `e${++idRef.current}`, time: clock(), level, severity, text }]);
  }, []);

  const addThreat = useCallback((t) => {
    // Work from the ref and update it right away: two ticks can run before React re-renders, and the roll-off must not miss one.
    let next = [t, ...threatsRef.current];
    if (next.length > MAX_THREATS) {
      const oldest = next[next.length - 1];
      const key = oldest.severity.toLowerCase();
      setArchived((a) => ({ ...a, [key]: a[key] + 1 }));
      setArchivedStamps((a) => [...a, [Date.parse(oldest.detectedAt), key]]);
      next = next.slice(0, MAX_THREATS);
    }
    threatsRef.current = next;
    setThreats(next);
    if (t.category) setLiveCats((c) => ({ ...c, [t.category]: (c[t.category] || 0) + 1 }));
    const cur = srcRef.current[t.source] || { pages: 0, threats: 0 };
    srcRef.current[t.source] = { pages: cur.pages, threats: cur.threats + 1 };
    srcDirty.current = true;
  }, []);

  const runningCount = useMemo(() => fleet.filter((c) => c.status === 'running').length, [fleet]);
  const anyRunning = runningCount > 0;
  const status = anyRunning
    ? 'running'
    : fleet.some((c) => c.status === 'paused')
      ? 'paused'
      : fleet.some((c) => c.status === 'stopped')
        ? 'stopped' // nothing running or paused, and at least one was stopped (crawlers that never started stay idle)
        : 'idle';

  /* ---------- sparkline history: record pages and active crawlers whenever they change ---------- */
  const pagesTotal = useMemo(() => fleet.reduce((s, c) => s + c.pagesCrawled, 0), [fleet]);
  useEffect(() => {
    setHistory((h) => {
      const add = (arr, v) => (arr[arr.length - 1] === v ? arr : [...arr.slice(-(HISTORY - 1)), v]);
      const pages = add(h.pages, pagesTotal);
      const active = add(h.active, runningCount);
      return pages === h.pages && active === h.active ? h : { pages, active };
    });
  }, [pagesTotal, runningCount]);

  /* ---------- crawl clock: only ticks while something is running ---------- */
  useEffect(() => {
    if (!anyRunning) return undefined;
    const iv = setInterval(() => {
      const cur = fleetRef.current;
      const stepped = {};
      for (const c of cur) {
        if (c.status !== 'running') continue;
        const need = Math.max(150, 1100 / c.speed);
        const acc = (accRef.current[c.id] || 0) + TICK;
        if (acc >= need) {
          accRef.current[c.id] = acc - need;
          stepped[c.id] = true;
        } else accRef.current[c.id] = acc;
      }
      if (!Object.keys(stepped).length) return;

      const primaryId = cur[0]?.id;
      const patch = {};
      // credit each crawled page to the source its crawler is on, so the Source activity chart grows while crawlers run
      for (const c of cur) {
        if (!stepped[c.id] || c.pagesCrawled >= c.pagesDiscovered) continue;
        const k = c.source.name;
        const o = srcRef.current[k] || { pages: 0, threats: 0 };
        srcRef.current[k] = { pages: o.pages + 1, threats: o.threats };
        srcDirty.current = true;
      }
      if (stepped[primaryId]) {
        patch.latency = Math.floor(160 + Math.random() * 50);
        if (Math.random() > 0.7) patch.circuit = `${pick(CIRCUIT_HOPS)} → ${pick(CIRCUIT_HOPS)} → ${pick(CIRCUIT_HOPS)}`;
        const src = pick(sourcesJson);
        patch.source = { name: src.name, url: src.url };
        const tpl = pick(LOG_TEMPLATES);
        pushLog(tpl.level, tpl.color, tpl.text(src.url));
      }

      setFleet((prev) =>
        prev.map((c) => {
          if (!stepped[c.id] || c.status !== 'running') return c;
          const grown = c.pagesDiscovered + (Math.random() < 0.35 ? 1 + Math.floor(Math.random() * 3) : 0);
          const crawled = Math.min(grown, c.pagesCrawled + 1);
          return { ...c, pagesCrawled: crawled, pagesDiscovered: grown, ...(c.id === primaryId ? patch : null) };
        })
      );
    }, TICK);
    return () => clearInterval(iv);
  }, [anyRunning, pushLog]);

  /* ---------- activity feed + live threats ---------- */
  useEffect(() => {
    if (!anyRunning || !feedLive) return undefined;
    const iv = setInterval(() => {
      const running = fleetRef.current.filter((c) => c.status === 'running');
      if (!running.length) return;
      const c = pick(running);
      const e = pick(activityPool);
      pushEvent(`[${c.name}] ${e.text}`, e.level, e.severity);
      if (e.finding !== false && SEVERITIES.includes(e.severity)) addThreat(makeLiveThreat(e, c)); // routine status lines are feed-only, not threats
      if (e.severity === 'critical') {
        const now = Date.now();
        const last = lastAutomaticCriticalAtRef.current;
        if (last === null || now - last >= AUTO_CRITICAL_COOLDOWN_MS) {
          lastAutomaticCriticalAtRef.current = now;
          eventBus.emit('critical', { title: 'Critical threat detected' }); // automatic flashes are rate-limited; manual demo triggers are separate
        }
      }
    }, FEED_MS);
    return () => clearInterval(iv);
  }, [anyRunning, feedLive, pushEvent, addThreat]);

  /* ---------- publish the per-source counters in batches ---------- */
  useEffect(() => {
    const iv = setInterval(() => {
      if (!srcDirty.current) return;
      srcDirty.current = false;
      setLiveSrc({ ...srcRef.current });
    }, SRC_FLUSH_MS);
    return () => clearInterval(iv);
  }, []);

  /* ---------- commands ---------- */
  // command('start' | 'pause' | 'stop' | 'reset', crawlerId?)  -> no id = the whole fleet
  const command = useCallback(
    (cmd, id) => {
      const cur = fleetRef.current;
      const primaryId = cur[0]?.id;
      const targets = cur.filter((c) => id == null || c.id === id);
      const touches = (c) => {
        if (cmd === 'start') return c.status !== 'running';
        if (cmd === 'pause') return c.status === 'running';
        if (cmd === 'stop') return c.status === 'running' || c.status === 'paused';
        return true; // reset
      };

      setFleet((prev) =>
        prev.map((c) => {
          if (id != null && c.id !== id) return c;
          if (cmd === 'reset') return { ...SEEDS.get(c.id), pagesCrawled: 0, pagesDiscovered: RESET_TARGET, status: 'idle' };
          if (!touches(c)) return c;
          return { ...c, status: { start: 'running', pause: 'paused', stop: 'stopped' }[cmd] };
        })
      );

      targets.filter(touches).forEach((c) => {
        if (cmd === 'reset') accRef.current[c.id] = 0;
        const verb = { start: c.status === 'paused' ? 'resumed' : 'started', pause: 'paused', stop: 'stopped', reset: 'reset' }[cmd];
        const lvl = { start: 'success', pause: 'warn', stop: 'error', reset: 'info' }[cmd];
        pushEvent(`${c.name} ${verb}`, lvl);
      });

      // terminal messages for the primary crawler (the one the Crawler tab shows)
      if (targets.some((c) => c.id === primaryId) && touches(cur[0])) {
        if (cmd === 'start') pushLog('SCAN', '#00d4ff', cur[0].status === 'paused' ? 'Crawler resumed. Tor routing circuit active.' : 'Crawler dispatched. Tor routing circuit active.');
        if (cmd === 'pause') pushLog('WARN', '#f59e0b', 'Execution paused. Thread sockets held.');
        if (cmd === 'stop') pushLog('ALERT', '#ff0055', 'Crawler stopped completely.');
        if (cmd === 'reset') {
          setLogs([{ id: `l${++idRef.current}`, time: clock(), level: 'INDEX', color: '#a855f7', text: 'Crawler metrics reset. Pipeline ready.' }]);
        }
      }
    },
    [pushEvent, pushLog]
  );

  const setSpeed = useCallback((id, speed) => {
    accRef.current[id] = 0;
    setFleet((p) => p.map((c) => (c.id === id ? { ...c, speed } : c)));
  }, []);
  const clearLogs = useCallback(() => setLogs([]), []);
  const markReviewed = useCallback((threatId) => {
    setThreats((p) => p.map((t) => (t.id === threatId ? { ...t, status: 'Reviewed' } : t)));
  }, []);

  /* ---------- context values ---------- */
  const statusValue = useMemo(() => ({ status, command }), [status, command]);

  const fleetValue = useMemo(
    () => ({
      fleet,
      primary: fleet[0],
      logs,
      runningCount,
      pagesTotal,
      seedPages: SEED_PAGES,
      status,
      command,
      setSpeed,
      clearLogs,
    }),
    [fleet, logs, runningCount, pagesTotal, status, command, setSpeed, clearLogs]
  );

  const feedValue = useMemo(() => ({ events, feedLive, setFeedLive }), [events, feedLive]);

  const threatValue = useMemo(() => {
    const sev = { ...archived };
    for (const t of threats) sev[t.severity.toLowerCase()] += 1;
    const totalThreats = SEVERITIES.reduce((s, k) => s + sev[k], 0);
    const stamps = [...archivedStamps, ...threats.map((t) => [Date.parse(t.detectedAt), t.severity.toLowerCase()])];
    // 0-100 risk score: starts at the dataset value and moves with the severity mix (more critical = higher)
    const threatLevel = Math.round(Math.min(100, Math.max(0, seedLevel + 60 * (weighted(sev) - SEED_WEIGHT))));
    // chart series for the two extra Command Center charts: dataset baseline + whatever the simulation added
    const categories = seedCategories.map(([label, v]) => [label, v + (liveCats[label] || 0)]);
    return { threats, sev, totalThreats, stamps, threatLevel, markReviewed, categories };
  }, [threats, archived, archivedStamps, markReviewed, liveCats]);

  // its own context: changes at most every SRC_FLUSH_MS, and only the Source activity card reads it
  const sourceValue = useMemo(
    () =>
      seedSourceActivity.map((r) => ({
        label: r.label,
        pages: r.pages + (liveSrc[r.label]?.pages || 0),
        threats: r.threats + (liveSrc[r.label]?.threats || 0),
      })),
    [liveSrc]
  );

  return (
    <StatusCtx.Provider value={statusValue}>
      <FleetCtx.Provider value={fleetValue}>
        <FeedCtx.Provider value={feedValue}>
          <ThreatCtx.Provider value={threatValue}>
            <HistoryCtx.Provider value={history}>
              <SourceCtx.Provider value={sourceValue}>{children}</SourceCtx.Provider>
            </HistoryCtx.Provider>
          </ThreatCtx.Provider>
        </FeedCtx.Provider>
      </FleetCtx.Provider>
    </StatusCtx.Provider>
  );
}

export const useCrawlerStatus = () => useContext(StatusCtx);
export const useFleet = () => useContext(FleetCtx);
export const useFeed = () => useContext(FeedCtx);
export const useThreats = () => useContext(ThreatCtx);
export const useHistory = () => useContext(HistoryCtx);
export const useSourceActivity = () => useContext(SourceCtx); // [{ label, pages, threats }]
