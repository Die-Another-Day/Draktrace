// Watches the real frame rate. If the page cannot hold ~40 fps for two 3-second windows in a row,
// it switches on "lite" mode once: digital rain off and the animated backdrop layers frozen.
import { useEffect } from 'react';

export function useAutoQuality(active, onLite) {
  useEffect(() => {
    if (!active || document.documentElement.classList.contains('perf-lite')) return undefined;
    let raf = 0;
    let frames = 0;
    let start = 0;
    let bad = 0;
    const tick = (now) => {
      if (document.hidden) { start = 0; frames = 0; raf = requestAnimationFrame(tick); return; }
      if (!start) start = now;
      frames += 1;
      if (now - start >= 3000) {
        const fps = (frames * 1000) / (now - start);
        bad = fps < 40 ? bad + 1 : 0;
        frames = 0; start = now;
        if (bad >= 2) {
          document.documentElement.classList.add('perf-lite');
          onLite?.();
          return; // stop sampling once lite mode is on
        }
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [active, onLite]);
}
