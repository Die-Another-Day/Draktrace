// QA: edge-case datasets (empty, single point, zeros, huge, negative-free) must never produce NaN/Infinity geometry.
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, it, expect } from 'vitest';
import { CrawlingActivity, SeverityDistribution, SourceActivity, ThreatCategories, ThreatsOverTime } from './index.js';

const bad = (html) => /NaN|Infinity|undefined/.test(html);
const labels = (n) => Array.from({ length: n }, (_, i) => `L${i}`);

describe('chart edge cases', () => {
  const sets = {
    empty: { labels: [], values: [] },
    single: { labels: ['A'], values: [5] },
    zeros: { labels: labels(8), values: Array(8).fill(0) },
    huge: { labels: labels(8), values: [1e9, 5, 0, 2e9, 1, 1, 3e9, 0] },
    flat: { labels: labels(8), values: Array(8).fill(7) },
  };
  for (const [name, d] of Object.entries(sets)) {
    it(`ThreatsOverTime handles ${name}`, () => expect(bad(renderToStaticMarkup(<ThreatsOverTime {...d} />))).toBe(false));
    it(`CrawlingActivity handles ${name}`, () => expect(bad(renderToStaticMarkup(<CrawlingActivity {...d} />))).toBe(false));
  }
  it('SeverityDistribution handles empty / zero / huge', () => {
    for (const data of [undefined, {}, { critical: 0, high: 0, medium: 0, low: 0 }, { critical: 1e9, high: 1, medium: 0, low: 0 }, { critical: 1 }]) {
      expect(bad(renderToStaticMarkup(<SeverityDistribution data={data} />))).toBe(false);
    }
  });
  it('SourceActivity handles empty / zero / huge', () => {
    for (const data of [undefined, [], [{ label: 'a', pages: 0, threats: 0 }], [{ label: 'a', pages: 1e9, threats: 3 }, { label: 'b', pages: 1, threats: 0 }]]) {
      expect(bad(renderToStaticMarkup(<SourceActivity data={data} />))).toBe(false);
    }
  });
  it('ThreatCategories handles empty / zero / huge', () => {
    for (const data of [undefined, [], [['x', 0]], [['x', 1e9], ['y', 1]]]) {
      expect(bad(renderToStaticMarkup(<ThreatCategories data={data} />))).toBe(false);
    }
  });
});

// Saksham BUG-11: negative, NaN, more values than labels, duplicate labels
describe('chart edge cases: hostile values (BUG-11)', () => {
  const hostile = {
    negative: { labels: labels(6), values: [3, -5, 8, -1, 0, 2] },
    nan: { labels: labels(6), values: [3, NaN, 8, Infinity, 0, 2] },
    moreValues: { labels: labels(3), values: [1, 2, 3, 4, 5, 6] },
    moreLabels: { labels: labels(8), values: [1, 2, 3] },
    dupLabels: { labels: ['A', 'A', 'A', 'B', 'B'], values: [1, 2, 3, 4, 5] },
  };
  for (const [name, d] of Object.entries(hostile)) {
    it(`ThreatsOverTime survives ${name}`, () => expect(bad(renderToStaticMarkup(<ThreatsOverTime {...d} />))).toBe(false));
    it(`CrawlingActivity survives ${name}`, () => expect(bad(renderToStaticMarkup(<CrawlingActivity {...d} />))).toBe(false));
  }
  it('SeverityDistribution survives negative / NaN counts', () => {
    for (const data of [{ critical: -4, high: 12, medium: 15, low: 9 }, { critical: NaN, high: 12, medium: Infinity, low: 9 }]) {
      expect(bad(renderToStaticMarkup(<SeverityDistribution data={data} />))).toBe(false);
    }
  });
  it('SourceActivity / ThreatCategories survive negative / NaN / duplicate names', () => {
    expect(bad(renderToStaticMarkup(<SourceActivity data={[{ label: 'a', pages: -5, threats: NaN }, { label: 'a', pages: 3, threats: 1 }]} />))).toBe(false);
    expect(bad(renderToStaticMarkup(<ThreatCategories data={[['x', -2], ['x', NaN], ['y', 3]]} />))).toBe(false);
  });
});
