// Lightweight SVG chart (no chart library): horizontal bars, one per threat category, sorted high to low.
// Expected props: data ([label, count][]), selected (label | 'all'), onSelect(label) (optional; bars become clickable)
const COLORS = ['var(--accent)', 'var(--accent-2)', 'var(--sev-high)', 'var(--sev-medium)', 'var(--sev-low)', 'var(--sev-critical)'];
import { num } from './safe.js';
const pretty = (s) => String(s).replace(/-/g, ' ');

export default function ThreatCategories({ data = [], selected = 'all', onSelect }) {
  const rows = data.map(([l, v]) => [String(l ?? ''), num(v)]).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]));
  const max = Math.max(...rows.map((r) => r[1]), 1);
  const total = rows.reduce((s, r) => s + r[1], 0);
  return (
    <ul className="cc-cats" aria-label="Threat categories">
      {rows.map(([label, v], i) => {
        const on = selected === label;
        const body = (
          <>
            <span className="cc-cats__name">{pretty(label)}</span>
            <span className="cc-cats__track" aria-hidden="true">
              <span className="cc-cats__fill" style={{ width: `${(v / max) * 100}%`, background: COLORS[i % COLORS.length] }} />
            </span>
            <b className="cc-cats__val">{v.toLocaleString()}</b>
          </>
        );
        return (
          <li key={`${label}-${i}`} title={`${pretty(label)}: ${v} (${Math.round((v / (total || 1)) * 100)}%)`}>
            {onSelect ? (
              <button type="button" className={`cc-cats__row${on ? ' is-on' : ''}`} aria-pressed={on} onClick={() => onSelect(label)}>{body}</button>
            ) : (
              <div className="cc-cats__row">{body}</div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
