import { describe, it, expect, afterEach } from 'vitest';
import { render, screen, cleanup, fireEvent, act, within } from '@testing-library/react';
import { CrawlerProvider } from './CrawlerContext';
import { ToastProvider } from '../components/ui';
import CommandCenter from '../modules/CommandCenter/CommandCenter';
import ThreatIntelligence from '../modules/ThreatIntelligence/ThreatIntelligence';
import CrawlerTab from '../modules/DarkWebCrawler/CrawlerTab';

afterEach(cleanup);
// jsdom has no canvas: give the topology canvas a no-op 2D context
const noop = new Proxy({}, { get: () => () => {}, set: () => true });
HTMLCanvasElement.prototype.getContext = () => noop;
window.requestAnimationFrame = window.requestAnimationFrame || ((cb) => setTimeout(cb, 16));
globalThis.ResizeObserver = globalThis.ResizeObserver || class { observe() {} unobserve() {} disconnect() {} };
const wrap = (ui) => render(<ToastProvider><CrawlerProvider>{ui}</CrawlerProvider></ToastProvider>);

describe('Command Center shows all 5 requested charts', () => {
  it('renders Threats over time, Severity distribution, Crawling activity, Threat categories, Source activity', () => {
    wrap(<CommandCenter />);
    for (const t of ['Threats over time', 'Severity distribution', 'Crawling activity', 'Threat categories', 'Source activity']) {
      expect(screen.getByText(t)).toBeTruthy();
    }
    expect(screen.getByLabelText('Threat categories').querySelectorAll('li')).toHaveLength(6);
    expect(screen.getByLabelText(/Source activity: pages crawled/).querySelectorAll('li')).toHaveLength(12);
  });
});

describe('Threat details use the shared Modal', () => {
  it('opens as a dialog, Esc closes it, Mark as Reviewed works', () => {
    wrap(<ThreatIntelligence />);
    fireEvent.click(document.querySelector('.threat-card'));
    const dlg = screen.getByRole('dialog');
    expect(dlg.className).toContain('dt-modal');
    fireEvent.click(within(dlg).getByRole('button', { name: 'Mark as Reviewed' }));
    expect(within(screen.getByRole('dialog')).getByRole('button', { name: 'Reviewed' }).disabled).toBe(true);
    act(() => { fireEvent.keyDown(document, { key: 'Escape' }); });
    expect(screen.queryByRole('dialog')).toBeNull();
  });
  it('closes on the Close button', () => {
    wrap(<ThreatIntelligence />);
    fireEvent.click(document.querySelector('.threat-card'));
    fireEvent.click(screen.getByRole('button', { name: 'Close dialog' }));
    expect(screen.queryByRole('dialog')).toBeNull();
  });
});

describe('Crawler tab starts idle and its controls drive visible activity', () => {
  it('shows the idle prompt before START, activity while running, then hides the loader on STOP', () => {
    wrap(<CrawlerTab />);
    expect(screen.getByText('No activity yet. Press START to dispatch the crawler.')).toBeTruthy();
    expect(document.querySelectorAll('.dt-loader').length).toBe(0);
    const start = screen.getByRole('button', { name: 'START' });
    expect(start.disabled).toBe(false);
    fireEvent.click(start);
    expect(screen.getByText('Crawler dispatched. Tor routing circuit active.')).toBeTruthy();
    expect(document.querySelectorAll('.dt-loader').length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole('button', { name: /stop/i }));
    expect(document.querySelectorAll('.dt-loader').length).toBe(0);
  });
});
