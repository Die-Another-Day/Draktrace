// Global 3D / HUD interactions:
// - TargetLock: HUD corner brackets that snap around whatever you hover
// - useMagnetic: elements with [data-magnetic] lean toward the cursor in 3D
// - useCameraParallax: exposes --cam-x / --cam-y (-1..1) so backdrop layers pan
// - CubeLogo: CSS 3D cube that follows the mouse and spins when clicked
import { useEffect, useRef, useState } from 'react';
import { eventBus } from '../../hooks/eventBus';

const fine = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;
const LOCKABLE = '.card, .dt-card, .dt-stat, .threat-card, .nav-item, .cmd-btn, .top-btn, .icon-btn, .hero-btn, .palette-list li';

export function TargetLock() {
  const ref = useRef(null);

  useEffect(() => {
    if (!fine()) return undefined;
    const el = ref.current;
    let target = null;
    let raf;
    let lastBox = '';

    const place = () => {
      if (!target || !target.isConnected) {
        el.classList.remove('is-on');
        target = null;
        return;
      }
      const r = target.getBoundingClientRect();
      const pad = target.matches('.card, .dt-card, .dt-stat, .threat-card') ? 8 : 5;
      const box = `${Math.round(r.left - pad)}|${Math.round(r.top - pad)}|${Math.round(r.width + pad * 2)}|${Math.round(r.height + pad * 2)}`;
      if (box !== lastBox) {
        // write only when the target actually moved or resized
        lastBox = box;
        el.style.transform = `translate3d(${r.left - pad}px, ${r.top - pad}px, 0)`;
        el.style.width = `${r.width + pad * 2}px`;
        el.style.height = `${r.height + pad * 2}px`;
      }
      raf = requestAnimationFrame(place); // follow tilt / scroll while locked
    };

    const onOver = (e) => {
      const t = e.target.closest?.(LOCKABLE);
      if (t === target) return;
      cancelAnimationFrame(raf);
      target = t;
      lastBox = '';
      if (t) {
        el.classList.add('is-on');
        el.classList.toggle('is-small', !t.matches('.card, .dt-card, .dt-stat, .threat-card'));
        el.classList.remove('lock-in');
        void el.offsetWidth;
        el.classList.add('lock-in');
        place();
      } else el.classList.remove('is-on');
    };
    const onLeave = () => {
      target = null;
      el.classList.remove('is-on');
    };

    document.addEventListener('pointerover', onOver, { passive: true });
    document.documentElement.addEventListener('mouseleave', onLeave);
    return () => {
      cancelAnimationFrame(raf);
      document.removeEventListener('pointerover', onOver);
      document.documentElement.removeEventListener('mouseleave', onLeave);
    };
  }, []);

  return (
    <div ref={ref} className="target-lock" aria-hidden="true">
      <i className="tl tl-tl" />
      <i className="tl tl-tr" />
      <i className="tl tl-bl" />
      <i className="tl tl-br" />
    </div>
  );
}

export function useMagnetic() {
  useEffect(() => {
    if (!fine()) return undefined;
    let raf = 0;
    let items = [];
    let stale = true;
    let lastEvent = null;
    const rects = new WeakMap(); // last un-magnetised centre per element

    // Layout is read only when something changed (scroll, resize, tab switch), never on every mouse move.
    const refresh = () => {
      items = [];
      document.querySelectorAll('[data-magnetic]').forEach((el) => {
        let it = rects.get(el);
        if (!it || !el.classList.contains('is-magnet')) {
          const r = el.getBoundingClientRect();
          it = { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, reach: Math.max(r.width, r.height) * 0.5 + 40 };
          rects.set(el, it);
        }
        items.push(it);
      });
      stale = false;
    };
    const markStale = () => {
      stale = true;
    };

    const apply = () => {
      raf = 0;
      if (!lastEvent) return;
      if (stale) refresh();
      const { clientX, clientY } = lastEvent;
      for (const it of items) {
        const dx = clientX - it.cx;
        const dy = clientY - it.cy;
        const near = Math.abs(dx) < it.reach && Math.abs(dy) < it.reach;
        if (near) {
          const k = 1 - Math.max(Math.abs(dx), Math.abs(dy)) / it.reach;
          it.el.style.transform = `perspective(300px) translate3d(${dx * 0.22 * k}px, ${dy * 0.3 * k}px, ${k * 10}px) rotateX(${-dy * 0.25 * k}deg) rotateY(${dx * 0.12 * k}deg)`;
          it.el.classList.add('is-magnet');
        } else if (it.el.classList.contains('is-magnet')) {
          it.el.style.transform = '';
          it.el.classList.remove('is-magnet');
        }
      }
    };
    const onMove = (e) => {
      lastEvent = e;
      if (!raf) raf = requestAnimationFrame(apply);
    };

    window.addEventListener('pointermove', onMove, { passive: true });
    window.addEventListener('scroll', markStale, { passive: true, capture: true });
    window.addEventListener('resize', markStale);
    const off = eventBus.on(({ type }) => type === 'tab' && markStale());
    const mo = new MutationObserver(markStale); // new [data-magnetic] buttons appear/disappear with the page
    mo.observe(document.body, { childList: true, subtree: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('scroll', markStale, { capture: true });
      window.removeEventListener('resize', markStale);
      off();
      mo.disconnect();
    };
  }, []);
}

export function useCameraParallax() {
  useEffect(() => {
    if (!fine()) return undefined;
    // Scoped to the backdrop. Setting these on <html> forced a style recalculation of the whole document every frame.
    const root = document.querySelector('.backdrop')?.style;
    if (!root) return undefined;
    const target = { x: 0, y: 0 };
    const cur = { x: 0, y: 0 };
    let raf = 0, prev = 0;
    const loop = (now) => {
      const k = 1 - Math.exp(-Math.min(0.1, prev ? (now - prev) / 1000 : 1 / 60) * 3.7); // time-based easing: same feel at any refresh rate
      prev = now;
      cur.x += (target.x - cur.x) * k;
      cur.y += (target.y - cur.y) * k;
      root.setProperty('--cam-x', cur.x.toFixed(4));
      root.setProperty('--cam-y', cur.y.toFixed(4));
      if (Math.abs(target.x - cur.x) > 0.001 || Math.abs(target.y - cur.y) > 0.001) raf = requestAnimationFrame(loop);
      else { raf = 0; prev = 0; }
    };
    const onMove = (e) => {
      target.x = (e.clientX / window.innerWidth) * 2 - 1;
      target.y = (e.clientY / window.innerHeight) * 2 - 1;
      if (!raf) raf = requestAnimationFrame(loop);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
    };
  }, []);
}

export function CubeLogo() {
  const ref = useRef(null);
  const [spin, setSpin] = useState(0);

  useEffect(() => {
    if (!fine()) return undefined;
    const el = ref.current;
    const onMove = (e) => {
      const r = el.getBoundingClientRect();
      const dx = (e.clientX - (r.left + r.width / 2)) / window.innerWidth;
      const dy = (e.clientY - (r.top + r.height / 2)) / window.innerHeight;
      el.style.setProperty('--look-y', `${dx * 70}deg`);
      el.style.setProperty('--look-x', `${-dy * 70}deg`);
    };
    window.addEventListener('pointermove', onMove, { passive: true });
    return () => window.removeEventListener('pointermove', onMove);
  }, []);

  return (
    <button
      ref={ref}
      type="button"
      className="cube-logo"
      onClick={() => setSpin((s) => s + 1)}
      aria-label="DarkTrace logo"
      title="Click to spin"
    >
      <span className="cube" style={{ '--spin': `${spin * 360}deg` }}>
        <i className="f f-front" />
        <i className="f f-back" />
        <i className="f f-right" />
        <i className="f f-left" />
        <i className="f f-top" />
        <i className="f f-bottom" />
        <b className="cube-core" />
      </span>
    </button>
  );
}
