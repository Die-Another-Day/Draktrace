import { describe, it, expect, vi, afterEach } from 'vitest';
import { act, renderHook, cleanup, render, screen } from '@testing-library/react';
import { CrawlerProvider, useThreats, useFleet, useCrawlerStatus, useSourceActivity } from './CrawlerContext';
import { ThreatCategories, SourceActivity } from '../components/charts';
import charts from '../mock-data/charts.json';

afterEach(() => { cleanup(); vi.useRealTimers(); });
const setup = () => renderHook(() => ({ t: useThreats(), f: useFleet(), s: useCrawlerStatus(), src: useSourceActivity() }), { wrapper: CrawlerProvider });

describe('threat categories + source activity data (charts.json)', () => {
  it('start from the dataset', () => {
    const { result } = setup();
    expect(Object.fromEntries(result.current.t.categories)).toEqual(
      Object.fromEntries(charts.threatCategories.labels.map((l, i) => [l, charts.threatCategories.values[i]]))
    );
    expect(result.current.src).toHaveLength(charts.sourceActivity.labels.length);
    expect(result.current.src[0]).toEqual({
      label: charts.sourceActivity.labels[0], pages: charts.sourceActivity.pagesCrawled[0], threats: charts.sourceActivity.threatsFound[0],
    });
  });

  it('grow while the simulation runs (more findings and more pages, never fewer)', () => {
    vi.useFakeTimers();
    const { result } = setup();
    act(() => result.current.s.command('start'));
    const sum = (a, f) => a.reduce((s, x) => s + f(x), 0);
    const cat0 = sum(result.current.t.categories, (r) => r[1]);
    const pages0 = sum(result.current.src, (r) => r.pages);
    act(() => { vi.advanceTimersByTime(60000); });
    expect(sum(result.current.t.categories, (r) => r[1])).toBeGreaterThan(cat0);
    expect(sum(result.current.src, (r) => r.pages)).toBeGreaterThan(pages0);
    for (const [, v] of result.current.t.categories) expect(v).toBeGreaterThan(0);
  });
});

describe('chart components', () => {
  it('ThreatCategories renders one row per category, sorted high to low', () => {
    render(<ThreatCategories data={[['malware', 2], ['data-leak', 9], ['phishing', 5]]} />);
    const rows = screen.getAllByRole('listitem');
    expect(rows).toHaveLength(3);
    expect(rows[0].textContent).toContain('data leak');
    expect(rows[2].textContent).toContain('malware');
  });
  it('SourceActivity shows pages and threats for every source', () => {
    render(<SourceActivity data={[{ label: 'A', pages: 10, threats: 0 }, { label: 'B', pages: 2000, threats: 4 }]} />);
    expect(screen.getAllByRole('listitem')).toHaveLength(2);
    expect(screen.getByText('2,000')).toBeTruthy();
    expect(screen.getByLabelText('4 threats')).toBeTruthy();
  });
});
