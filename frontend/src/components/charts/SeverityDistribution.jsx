// Lightweight SVG/CSS chart (no chart library). Keep these props if the component is ever swapped.
// Expected props: data { critical, high, medium, low }, size (px)
// Optional: selected ('all' | severity), onSelect(severity). Segments are clickable when onSelect is given.
import { num } from './safe.js';
const ORDER = ['critical', 'high', 'medium', 'low'];
export default function SeverityDistribution({ data = {}, size = 160, selected = 'all', onSelect }) {
  const val = (k) => num(data[k]);
  const total = ORDER.reduce((s, k) => s + val(k), 0) || 1;
  const r = 15.9155; // circumference = 100
  const pcts = ORDER.map((k) => (val(k) / total) * 100);
  const offsets = pcts.map((_, i) => 25 - pcts.slice(0, i).reduce((a, b) => a + b, 0));
  return (
    <div className="cc-donut" style={{ width: size, height: size }}>
      <svg viewBox="0 0 42 42" role="img" aria-label="Severity distribution">
        <circle cx="21" cy="21" r={r} className="cc-donut__track" />
        {ORDER.map((k, i) => {
          const pct = pcts[i];
          const offset = offsets[i];
          const el = (
            <circle key={k} cx="21" cy="21" r={r} className={`cc-donut__seg cc-donut__seg--${k}${onSelect ? ' is-clickable' : ''}${selected !== 'all' && selected !== k ? ' is-dim' : ''}`}
              onClick={onSelect ? () => onSelect(k) : undefined}
              strokeDasharray={`${Math.max(pct - 0.6, 0)} ${100 - Math.max(pct - 0.6, 0)}`} strokeDashoffset={offset}>
              <title>{`${k}: ${val(k)}`}</title>
            </circle>
          );
          return el;
        })}
      </svg>
      <div className="cc-donut__center"><strong>{total.toLocaleString()}</strong><span>total</span></div>
    </div>
  );
}
