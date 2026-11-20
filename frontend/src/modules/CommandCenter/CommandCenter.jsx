import { useMemo, useState } from 'react';
import { Card, Button, Badge, ProgressBar, StatCard, ThreatGauge, LogFeed, Tooltip, useToast } from '../../components/ui';
import { ThreatsOverTime, CrawlingActivity, SeverityDistribution, ThreatCategories, SourceActivity } from '../../components/charts';
import { stats } from '../../mock/commandCenter';
import { useFleet, useFeed, useThreats, useHistory, useSourceActivity, progressOf } from '../../context/CrawlerContext';
import { useThreatSeries, useCrawlingActivity } from '../../hooks/useLiveCharts';
import './CommandCenter.css';

const SEVERITIES = ['critical', 'high', 'medium', 'low'];

// Reads the (throttled) per-source counters here, so the rest of the dashboard does not re-render with them.
function SourceActivityLive() {
  return <SourceActivity data={useSourceActivity()} />;
}

// All data now comes from the shared CrawlerContext (same fleet, feed and threat list the other tabs use).
export default function CommandCenter() {
  const toast = useToast();
  const [filter, setFilter] = useState('all');
  const { fleet: crawlers, runningCount: activeCount, pagesTotal: pages, command } = useFleet();
  const { events, feedLive: live, setFeedLive } = useFeed();
  const { sev, totalThreats, threatLevel, categories } = useThreats();
  const history = useHistory();
  const threatSeries = useThreatSeries(8);
  const crawlingActivity = useCrawlingActivity();

  const setStatus = (c, status) => {
    command({ running: 'start', paused: 'pause', stopped: 'stop' }[status], c.id);
    if (status === 'running') toast.success(`${c.name} started`);
    if (status === 'paused') toast.warning(`${c.name} paused`);
    if (status === 'stopped') toast.error(`${c.name} stopped`);
  };

  const shown = useMemo(() => (filter === 'all' ? events : events.filter((e) => e.severity === filter)), [events, filter]);

  const toggleLive = () => {
    setFeedLive(!live);
    toast.info(live ? 'Live monitoring paused' : 'Live monitoring resumed');
  };
  const pickSeverity = (k) => { setFilter((f) => (f === k ? 'all' : k)); };

  return (
    <div className="cc">
      <header className="cc-head">
        <div className="cc-head__right">
          <Badge status={!live ? 'paused' : activeCount > 0 ? 'running' : 'idle'}>{!live ? 'PAUSED' : activeCount > 0 ? 'LIVE MONITORING' : 'STANDBY'}</Badge>
          <Button size="sm" variant="ghost" onClick={toggleLive}>{live ? 'Pause feed' : 'Resume feed'}</Button>
        </div>
      </header>

      <section className="cc-stats" aria-label="Key statistics">
        <StatCard label="Threats detected" value={totalThreats} delta={stats.threats.delta} upIsBad trend={threatSeries.cumulative} variant="critical" />
        <StatCard label="Sources monitored" value={stats.sources.value} delta={stats.sources.delta} trend={stats.sources.trend} variant="accent" />
        <StatCard label="Pages crawled" value={pages} delta={stats.pages.delta} trend={history.pages} variant="low" />
        <StatCard label="Active crawlers" value={activeCount} unit={` / ${crawlers.length}`} delta={stats.crawlers.delta} trend={history.active} variant="medium" />
      </section>

      <section className="cc-sev" aria-label="Severity breakdown">
        {SEVERITIES.map((k) => (
          <Card key={k} severity={k} glow={k === 'critical'} onClick={() => pickSeverity(k)}
            className={filter === k ? 'cc-sev__card is-selected' : 'cc-sev__card'}>
            <div className="cc-sev__top">
              <Badge severity={k} />
              <span className="cc-sev__count">{sev[k].toLocaleString()}</span>
            </div>
            <ProgressBar value={totalThreats ? (sev[k] / totalThreats) * 100 : 0} variant={k} size="sm" label="Share of all threats" />
          </Card>
        ))}
      </section>

      <div className="cc-grid">
        <Card title="Threats over time" subtitle="Last 24 hours" className="cc-span-2">
          <ThreatsOverTime labels={threatSeries.labels} values={threatSeries.values} />
        </Card>
        <Card title="Threat level" subtitle="Overall risk score" className="cc-fit">
          <ThreatGauge value={threatLevel} label="Current level" />
        </Card>

        <Card title="Severity distribution" subtitle="Click a segment to filter activity" className="cc-fit">
          <div className="cc-center"><SeverityDistribution data={sev} size={200} selected={filter} onSelect={pickSeverity} /></div>
          <ul className="cc-legend">
            {SEVERITIES.map((k) => (
              <li key={k}>
                <button type="button" className={`cc-legend__btn${filter === k ? ' is-on' : ''}`} aria-pressed={filter === k}
                  onClick={() => pickSeverity(k)} title={`Filter activity: ${k}`}>
                  <i className={`cc-dot cc-dot--${k}`} />{k}<b>{sev[k].toLocaleString()}</b>
                </button>
              </li>
            ))}
          </ul>
        </Card>
        <Card title="Crawling activity" subtitle="Pages per day, this week" className="cc-fit">
          <CrawlingActivity {...crawlingActivity} height="100%" />
        </Card>
        <Card title="Threat categories" subtitle="Findings by type" className="cc-fit">
          <ThreatCategories data={categories} />
        </Card>
        <Card title="Source activity" subtitle="Pages crawled and threats found per source" className="cc-fit cc-span-2">
          <SourceActivityLive />
        </Card>
        <Card title="Crawlers" subtitle={`${activeCount} running`} className="cc-fit cc-crawlers-card">
          <ul className="cc-crawlers">
            {crawlers.map((c) => (
              <li key={c.id} className={`cc-crawlers__item is-${c.status}`}>
                <div className="cc-crawlers__row">
                  <div className="cc-crawlers__identity">
                    <Tooltip content={`Current source: ${c.source.name}`}><span className="cc-crawlers__name">{c.name}</span></Tooltip>
                    <Badge status={c.status} />
                  </div>
                  <div className="cc-crawlers__actions">
                    {c.status !== 'running' && <Button size="sm" onClick={() => setStatus(c, 'running')}>{c.status === 'paused' ? 'Resume' : 'Start'}</Button>}
                    {c.status === 'running' && <Button size="sm" variant="ghost" onClick={() => setStatus(c, 'paused')}>Pause</Button>}
                    {(c.status === 'running' || c.status === 'paused') && <Button size="sm" variant="danger" onClick={() => setStatus(c, 'stopped')}>Stop</Button>}
                  </div>
                </div>
                <ProgressBar value={progressOf(c)} size="sm" showValue={false} active={c.status === 'running'} label={c.source.name} />
              </li>
            ))}
          </ul>
        </Card>

        <Card title="Recent activity" className="cc-span-3"
          subtitle={filter === 'all' ? 'All severities' : `Filtered: ${filter}`}
          actions={
            <div className="cc-filters" role="group" aria-label="Filter activity by severity">
              {['all', ...SEVERITIES].map((k) => (
                <button key={k} type="button" className={`cc-chip${filter === k ? ' is-on' : ''}`} onClick={() => (k === 'all' ? setFilter('all') : pickSeverity(k))}>{k}</button>
              ))}
            </div>
          }>
          <LogFeed lines={shown} height={260} live={live} empty="No events match this filter." />
        </Card>
      </div>
    </div>
  );
}
