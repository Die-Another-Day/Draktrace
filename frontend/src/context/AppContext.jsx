// Shared UI state for the app shell (tab, rain, palette, boot).
// Crawler data lives in CrawlerContext; this file only mirrors its status so the rain and globe react to it.
import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { eventBus } from '../hooks/eventBus';
import { useCrawlerStatus } from './CrawlerContext';

const TAB_IDS = ['command', 'crawler', 'intel'];
// "#/crawler" -> "crawler"; anything unknown or empty falls back to the Command Center
const tabFromHash = () => {
  const h = window.location.hash.replace(/^#\/?/, '');
  return TAB_IDS.includes(h) ? h : 'command';
};

const AppContext = createContext(null);

export function AppProvider({ children }) {
  const { status: crawlerStatus, command } = useCrawlerStatus();
  const [activeTab, setActiveTab] = useState(tabFromHash); // opens on the tab in the URL, so reload and deep links work
  const [rainEnabled, setRainEnabled] = useState(true);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [bootKey, setBootKey] = useState(0);
  const crawlerActive = crawlerStatus === 'running';

  const setCrawlerActive = useCallback((on) => command(on ? 'start' : 'stop'), [command]);

  const changeTab = useCallback((tab) => {
  // one history entry per real tab change, so Back/Forward walk through the tabs you visited
  if (tabFromHash() !== tab) window.history.pushState({ tab }, '', `#/${tab}`);
  setActiveTab(tab);
  eventBus.emit('tab', tab);
  window.scrollTo({ top: 0, behavior: 'smooth' });
}, []);

// Browser Back / Forward (and manual #/tab edits) switch the tab without adding history entries
useEffect(() => {
  const onPop = () => {
    const tab = tabFromHash();
    setActiveTab(tab);
    eventBus.emit('tab', tab);
    window.scrollTo({ top: 0 });
  };
  window.addEventListener('popstate', onPop);
  return () => window.removeEventListener('popstate', onPop);
}, []);

  // rain and the alert overlay react to this
  const triggerCritical = useCallback((threat) => eventBus.emit('critical', threat), []);
  const replayBoot = useCallback(() => setBootKey((k) => k + 1), []);

  useEffect(() => {
    eventBus.emit('crawler', { active: crawlerActive });
  }, [crawlerActive]);

  const value = useMemo(
    () => ({
      activeTab,
      setActiveTab: changeTab,
      rainEnabled,
      setRainEnabled,
      paletteOpen,
      setPaletteOpen,
      bootKey,
      replayBoot,
      crawlerActive,
      setCrawlerActive,
      crawlerStatus,
      triggerCritical,
    }),
    [activeTab, changeTab, rainEnabled, paletteOpen, bootKey, replayBoot, crawlerActive, setCrawlerActive, crawlerStatus, triggerCritical]
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

export const useApp = () => useContext(AppContext);
