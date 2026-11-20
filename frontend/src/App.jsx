import { useCallback, useEffect, useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { CrawlerProvider } from './context/CrawlerContext';
import Sidebar from './components/layout/Sidebar';
import Topbar from './components/layout/Topbar';
import { Backdrop, CursorLight, ClickRings, AlertOverlay } from './components/effects/Backdrop';
import { TargetLock, useMagnetic, useCameraParallax } from './components/effects/Interactions';
import { useAutoQuality } from './hooks/useAutoQuality';
import BootSequence from './components/effects/BootSequence';
import CommandPalette from './components/effects/CommandPalette';
import PerfOverlay from './components/effects/PerfOverlay';
import CommandCenter from './pages/CommandCenter';
import DarkWebCrawler from './pages/DarkWebCrawler';
import ThreatIntelligence from './pages/ThreatIntelligence';
import './components/layout/layout.css';

const PAGES = {
  command: CommandCenter,
  crawler: DarkWebCrawler,
  intel: ThreatIntelligence,
};
const TAB_KEYS = { 1: 'command', 2: 'crawler', 3: 'intel' };

function seenBoot() {
  try {
    return sessionStorage.getItem('dt-booted') === '1';
  } catch {
    return false;
  }
}

function Shell() {
  const { activeTab, setActiveTab, rainEnabled, setRainEnabled, paletteOpen, bootKey } = useApp();
  const Page = PAGES[activeTab];
  // boot shows until doneKey catches up with bootKey (replaying the boot bumps bootKey)
  const [doneKey, setDoneKey] = useState(() => (seenBoot() ? 0 : -1));
  const booting = doneKey !== bootKey;

  useMagnetic();
  useCameraParallax();
  const goLite = useCallback(() => setRainEnabled(false), [setRainEnabled]);
  useAutoQuality(!booting, goLite);

  const bootDone = useCallback(() => {
    setDoneKey(bootKey);
    try {
      sessionStorage.setItem('dt-booted', '1');
    } catch {
      /* storage unavailable: boot will just show again next time */
    }
  }, [bootKey]);

  // 1 / 2 / 3 switch tabs (ignored while typing or while any dialog is open)
  useEffect(() => {
    const onKey = (e) => {
      if (paletteOpen || e.ctrlKey || e.metaKey || e.altKey) return;
      if (/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName) || e.target.isContentEditable) return;
      if (document.querySelector('[aria-modal="true"]')) return;
      if (TAB_KEYS[e.key]) setActiveTab(TAB_KEYS[e.key]);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paletteOpen, setActiveTab]);

  return (
    <div className="app">
      <Backdrop rain={rainEnabled} />
      <CursorLight />
      <Sidebar />
      <div className="main">
        <Topbar />
        <main className="content">
          <Page key={activeTab} />
        </main>
      </div>
      <PerfOverlay />
      <TargetLock />
      <ClickRings />
      <AlertOverlay />
      <CommandPalette />
      {booting && <BootSequence key={bootKey} onDone={bootDone} />}
    </div>
  );
}

export default function App() {
  return (
    <CrawlerProvider>
      <AppProvider>
        <Shell />
      </AppProvider>
    </CrawlerProvider>
  );
}
