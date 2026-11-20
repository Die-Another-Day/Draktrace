// Lightweight SVG/CSS chart (no chart library). Keep these props if the component is ever swapped.
// Expected props: labels (string[]), values (number[]), height (px)
import { num } from './safe.js';
export default function CrawlingActivity({ labels = [], values: rawValues = [], height = 180 }) {
  const values = rawValues.map(num);
  const max = Math.max(...values, 1);
  return (
    <div className="cc-chart" style={{ height }}>
      <div className="cc-bars" role="img" aria-label="Crawling activity">
        {values.map((v, i) => (
          <div className="cc-bars__col" key={`${labels[i]}-${i}`} title={`${labels[i] ?? ''}: ${v.toLocaleString()} pages`}>
            <div className="cc-bars__bar" style={{ height: `${(v / max) * 100}%` }} />
          </div>
        ))}
      </div>
      <div className="cc-chart__axis">{labels.map((l, i) => <span key={`${l}-${i}`} className={i === 0 || i === Math.floor((labels.length - 1) / 2) || i === labels.length - 1 ? 'is-key' : undefined}>{l}</span>)}</div>
    </div>
  );
}
