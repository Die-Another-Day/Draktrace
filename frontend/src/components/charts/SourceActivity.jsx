// Lightweight SVG/CSS chart (no chart library): pages crawled per source as bars, threats found as a badge.
// Expected props: data ({ label, pages, threats }[]), height (px, optional; scrolls inside when shorter than the list)
import { num } from './safe.js';
export default function SourceActivity({ data = [], height }) {
  const rows = data.map((r) => ({ ...r, label: String(r.label ?? ''), pages: num(r.pages), threats: num(r.threats) })).sort((a, b) => b.pages - a.pages);
  const max = Math.max(...rows.map((r) => r.pages), 1);
  return (
    <div className="cc-src" style={height ? { maxHeight: height } : undefined}>
      <ul className="cc-src__list" aria-label="Source activity: pages crawled and threats found per source">
        {rows.map((r, i) => (
          <li key={`${r.label}-${i}`} className="cc-src__row" title={`${r.label}: ${r.pages.toLocaleString()} pages, ${r.threats} threats`}>
            <span className="cc-src__name">{r.label}</span>
            <span className="cc-src__track" aria-hidden="true">
              <span className="cc-src__fill" style={{ width: `${(r.pages / max) * 100}%` }} />
            </span>
            <span className="cc-src__pages">{r.pages.toLocaleString()}</span>
            <span className={`cc-src__threats${r.threats ? '' : ' is-zero'}`} aria-label={`${r.threats} threats`}>{r.threats}</span>
          </li>
        ))}
      </ul>
      <div className="cc-src__legend" aria-hidden="true"><span><i className="cc-src__sw" />pages crawled</span><span><i className="cc-src__sw cc-src__sw--t" />threats found</span></div>
    </div>
  );
}
