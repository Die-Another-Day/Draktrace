import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import './ui.css';

/**
 * Tooltip
 * Props: content (string|node), placement ('top'|'bottom'|'left'|'right'), children
 * Shows on hover and keyboard focus. Esc hides it while it is showing.
 * A disabled button inside still shows the tooltip on hover.
 */
export default function Tooltip({ content, placement = 'top', children, className = '' }) {
  const id = useId();
  const [active, setActive] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const bubbleRef = useRef(null);

  // keep the bubble inside the viewport: measure it while it is showing and shift it sideways if it would be cut off
  useLayoutEffect(() => {
    const el = bubbleRef.current;
    if (!el) return;
    if (!active) { el.style.removeProperty('--dt-tip-shift'); return; }
    el.style.setProperty('--dt-tip-shift', '0px');
    // the bubble is display:none until the browser applies :hover, so show it just for the measurement
    const prevDisplay = el.style.display;
    el.style.display = 'block';
    const r = el.getBoundingClientRect();
    el.style.display = prevDisplay;
    const vw = document.documentElement.clientWidth;
    const pad = 8;
    let shift = 0;
    if (r.left < pad) shift = pad - r.left;
    else if (r.right > vw - pad) shift = vw - pad - r.right;
    if (shift) el.style.setProperty('--dt-tip-shift', `${Math.round(shift)}px`);
  }, [active]);

  useEffect(() => {
    if (!active) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') setDismissed(true); };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [active]);

  return (
    <span
      className={['dt-tip', dismissed && 'is-dismissed', className].filter(Boolean).join(' ')}
      onMouseEnter={() => { setDismissed(false); setActive(true); }}
      onMouseLeave={() => setActive(false)}
      onFocus={() => setActive(true)}
      onBlur={() => setActive(false)}
    >
      <span className="dt-tip__trigger" aria-describedby={id}>
        {children}
      </span>
      <span role="tooltip" id={id} ref={bubbleRef} className={`dt-tip__bubble dt-tip__bubble--${placement}`}>
        {content}
      </span>
    </span>
  );
}
