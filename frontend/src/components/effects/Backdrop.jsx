// Layered 3D backdrop + interactive overlays.
import { useEffect, useRef, useState } from 'react';
import { eventBus } from '../../hooks/eventBus';
import DigitalRain from './DigitalRain';
import './effects.css';

/* Subtle particles: 22 tiny motes drifting upward. Fixed positions (no randomness at render), CSS-only animation. */
const PARTICLES = Array.from({ length: 22 }, (_, i) => ({
  left: `${(i * 37 + 11) % 100}%`,
  size: 1.5 + ((i * 5) % 4) * 0.7,
  dur: 18 + ((i * 7) % 14),
  delay: -((i * 3.1) % 20),
  drift: ((i * 13) % 9) - 4,
}));

/* Background stack: glow → grid → particles → rain → perspective floor → scanlines → vignette */
export function Backdrop({ rain }) {
  return (
    <div className="backdrop" aria-hidden="true">
      <div className="bd-glow" />
      <div className="bd-grid" />
      <div className="bd-particles">
        {PARTICLES.map((p, i) => (<i key={i} style={{ left: p.left, width: p.size, height: p.size, animationDuration: `${p.dur}s`, animationDelay: `${p.delay}s`, "--drift": `${p.drift}vw` }} />))}
      </div>
      <DigitalRain enabled={rain} />
      <div className="bd-horizon" />
      <div className="bd-floor" />
      <div className="bd-scanlines" />
      <div className="bd-vignette" />
    </div>
  );
}

/* Soft light that follows the cursor behind the glass panels */
export function CursorLight() {
  const ref = useRef(null);
  useEffect(() => {
    if (!window.matchMedia('(hover: hover)').matches) return undefined;
    const el = ref.current;
    const target = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
    const pos = { ...target };
    let raf = 0, prev = 0;
    const loop = (now) => {
      const k = 1 - Math.exp(-Math.min(0.1, prev ? (now - prev) / 1000 : 1 / 60) * 9); // time-based easing: same feel at any refresh rate
      prev = now;
      pos.x += (target.x - pos.x) * k;
      pos.y += (target.y - pos.y) * k;
      el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
      // stop once it has caught up: no 60 fps loop while the mouse is still
      raf = Math.abs(target.x - pos.x) > 0.3 || Math.abs(target.y - pos.y) > 0.3 ? requestAnimationFrame(loop) : (prev = 0);
    };
    const onMove = (e) => {
      target.x = e.clientX;
      target.y = e.clientY;
      el.classList.add('is-on');
      if (!raf) raf = requestAnimationFrame(loop);
    };
    const onLeave = () => el.classList.remove('is-on');
    window.addEventListener('pointermove', onMove, { passive: true });
    document.addEventListener('mouseleave', onLeave);
    el.style.transform = `translate3d(${pos.x}px, ${pos.y}px, 0)`;
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener('pointermove', onMove);
      document.removeEventListener('mouseleave', onLeave);
    };
  }, []);
  return <div ref={ref} className="cursor-light" aria-hidden="true" />;
}

/* Expanding shockwave ring on every click */
export function ClickRings() {
  const [rings, setRings] = useState([]);
  useEffect(() => {
    let id = 0;
    const onDown = (e) => {
      const ring = { id: ++id, x: e.clientX, y: e.clientY };
      setRings((r) => [...r.slice(-4), ring]);
      setTimeout(() => setRings((r) => r.filter((x) => x.id !== ring.id)), 700);
    };
    window.addEventListener('pointerdown', onDown, { passive: true });
    return () => window.removeEventListener('pointerdown', onDown);
  }, []);
  return (
    <div className="click-rings" aria-hidden="true">
      {rings.map((r) => (
        <span key={r.id} style={{ left: r.x, top: r.y }} />
      ))}
    </div>
  );
}

/* Red edge pulse + banner when a critical threat fires */
export function AlertOverlay() {
  const [alert, setAlert] = useState(null);
  useEffect(() => {
    let t;
    const off = eventBus.on(({ type, payload }) => {
      if (type !== 'critical') return;
      setAlert({ key: Date.now(), title: payload?.title || 'Critical threat detected' });
      clearTimeout(t);
      t = setTimeout(() => setAlert(null), 2800);
    });
    return () => {
      off();
      clearTimeout(t);
    };
  }, []);
  if (!alert) return null;
  return (
    <div className="alert-overlay" key={alert.key} role="alert">
      <div className="alert-banner">
        <span className="alert-tag">CRITICAL</span>
        <span className="glitch is-glitching" data-text={alert.title}>
          {alert.title}
        </span>
      </div>
    </div>
  );
}
