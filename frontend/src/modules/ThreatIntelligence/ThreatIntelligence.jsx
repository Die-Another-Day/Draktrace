import { memo, useCallback, useEffect, useMemo, useState } from "react";
import { Modal } from "../../components/ui";
import { useFleet, useThreats } from "../../context/CrawlerContext";
import { useThreatSeries } from "../../hooks/useLiveCharts";
import { timeAgo, useMinute } from "../../mock/timeline";
import "./ThreatIntelligence.css";

// Uses only the Clipboard API, so the browser's clipboard permission is respected:
// permission off, or an insecure (non-HTTPS) page -> it throws/is missing -> returns false -> "COPY FAILED".
async function copyText(text) {
  if (!window.isSecureContext || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false; // permission denied or the document is not focused
  }
}

const severityOrder = {
  Critical: 4,
  High: 3,
  Medium: 2,
  Low: 1,
};

// "5 min ago" that keeps counting while the app is open (one shared minute clock, see mock/timeline.js)
function TimeAgo({ at }) {
  const minute = useMinute();
  return <span>{timeAgo(minute - Date.parse(at))}</span>;
}

// Bars for the last 24 h in 8 buckets of 3 h. Heights are relative to the busiest bucket of that series.
const Sparkline = memo(function Sparkline({ variant, values }) {
  const max = Math.max(...values, 1);
  return (
    <div className={`stat-sparkline trend-${variant}`} aria-hidden="true">
      {values.map((v, index) => (
        <span key={`${variant}-${index}`} style={{ height: `${Math.max(6, (v / max) * 100)}%` }} />
      ))}
    </div>
  );
});

function SeverityBadge({ severity }) {
  return (
    <span className={`badge ${severity.toLowerCase()}`}>
      <span className="badge-dot" />
      {severity}
    </span>
  );
}

const ThreatCard = memo(function ThreatCard({ threat, onSelect }) {
  return (
    <button
      type="button"
      className="threat-card"
      onClick={() => onSelect(threat)}
      aria-label={`Open details for ${threat.name}`}
    >
      <div className="threat-card-top">
        <div>
          <small>{threat.type} IOC</small>
          <h3>{threat.name}</h3>
        </div>

        <SeverityBadge severity={threat.severity} />
      </div>

      <div className="threat-data">
        <div>
          <small>IOC</small>
          <code>{threat.ioc}</code>
        </div>

        <div>
          <small>Source</small>
          <span>{threat.source}</span>
        </div>

        <div>
          <small>Detected</small>
          <TimeAgo at={threat.detectedAt} />
        </div>
      </div>

      <span className="card-arrow">↗</span>
    </button>
  );
});

const niceMax = (v) => {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const m = Math.ceil(v / pow) * pow;
  return m % 2 ? m + 1 : m; // even, so the middle axis label is a whole number
};

const ThreatActivityChart = memo(function ThreatActivityChart({ criticalCount, total, values }) {
  const maxValue = niceMax(Math.max(...values, 1));
  const chartWidth = 600;
  const chartHeight = 180;
  const hoursAgo = (i) => ((values.length - 1 - i) * 24) / values.length; // point i = the bucket that ends this many hours ago

  const linePoints = values
    .map((value, index) => {
      const x = (index / (values.length - 1)) * chartWidth;
      const y = chartHeight - (value / maxValue) * chartHeight;
      return `${x},${y}`;
    })
    .join(" ");

  const areaPoints = `0,${chartHeight} ${linePoints} ${chartWidth},${chartHeight}`;

  return (
    <section
      className="activity-panel"
      aria-label="Threat activity for the last 24 hours"
    >
      <div className="activity-heading">
        <div>
          <p className="eyebrow">TELEMETRY OVERVIEW</p>
          <h2>Threat activity — last 24 hours</h2>
        </div>

        <div className="activity-summary">
          <span>{total} indicators</span>
          <span>{criticalCount} critical</span>
        </div>
      </div>

      <div className="activity-chart">
        <div className="activity-y-axis">
          <span>{maxValue}</span>
          <span>{maxValue / 2}</span>
          <span>0</span>
        </div>

        <div className="activity-plot">
          <div className="activity-grid-line line-one" />
          <div className="activity-grid-line line-two" />
          <div className="activity-grid-line line-three" />

          <svg
            className="activity-line"
            viewBox={`0 0 ${chartWidth} ${chartHeight}`}
            preserveAspectRatio="none"
            role="img"
            aria-label={`Threat activity trend, ${total} indicators`}
          >
            <defs>
              <linearGradient id="activityFill" x1="0" x2="0" y1="0" y2="1">
                <stop offset="0%" stopColor="#35d8ef" stopOpacity="0.25" />
                <stop offset="100%" stopColor="#35d8ef" stopOpacity="0" />
              </linearGradient>
            </defs>

            <polygon points={areaPoints} fill="url(#activityFill)" />

            <polyline
              points={linePoints}
              fill="none"
              stroke="#55d9dc"
              strokeWidth="3"
              vectorEffect="non-scaling-stroke"
            />

            {values.map((value, index) => {
              const x = (index / (values.length - 1)) * chartWidth;
              const y = chartHeight - (value / maxValue) * chartHeight;

              return (
                <circle
                  key={index}
                  cx={x}
                  cy={y}
                  r="3"
                  fill="#071016"
                  stroke="#55d9dc"
                  strokeWidth="2"
                  vectorEffect="non-scaling-stroke"
                />
              );
            })}
          </svg>

          <div className="activity-x-axis" aria-label="Time scale">
            {[...new Set([0, Math.round((values.length - 1) / 3), Math.round(2 * (values.length - 1) / 3), values.length - 1])].map((i) => {
              const frac = values.length > 1 ? i / (values.length - 1) : 0;
              const edge = i === 0 ? "start" : i === values.length - 1 ? "end" : "middle";
              const align = edge === "start" ? "translateX(0)" : edge === "end" ? "translateX(-100%)" : "translateX(-50%)";
              return (
                <span
                  key={i}
                  className={`activity-x-axis__tick activity-x-axis__tick--${edge}`}
                  style={{ left: `${frac * 100}%`, transform: align }}
                >
                  {i === values.length - 1 ? "now" : `-${Math.round(hoursAgo(i))}h`}
                </span>
              );
            })}
          </div>
        </div>
      </div>
    </section>
  );
});

// Uses the shared <Modal> (focus trap, Esc, backdrop click, scroll lock, portal to <body>)
const filterStore = { search: "", severity: "All", type: "All", source: "All", sort: "Newest" };
function usePersistedFilter(key) {
  const [value, setValue] = useState(filterStore[key]);
  const update = useCallback(
    (next) => {
      filterStore[key] = next;
      setValue(next);
    },
    [key]
  );
  return [value, update];
}

function ThreatDetails({ threat, onClose, onReviewed, copied, onCopy }) {
  const isReviewed = threat?.status === "Reviewed";
  return (
    <Modal
      open={Boolean(threat)}
      onClose={onClose}
      size="md"
      title={threat?.name}
      footer={
        threat && (
          <button
            type="button"
            className={`review-button ${isReviewed ? "is-reviewed" : ""}`}
            disabled={isReviewed}
            onClick={() => onReviewed(threat.id)}
          >
            {isReviewed ? "Reviewed" : "Mark as Reviewed"}
          </button>
        )
      }
    >
      {threat && (
        <>
          <p className="eyebrow">THREAT DETAILS</p>
          <div className="details-badges">
            <SeverityBadge severity={threat.severity} />
            <span className={`status-badge ${isReviewed ? "reviewed" : ""}`}>{threat.status}</span>
          </div>

          <div className="details-grid">
            <div className="ioc-detail">
              <small>IOC</small>
              <div className="ioc-copy-row">
                <code>{threat.ioc}</code>
                <button type="button" className="copy-button" onClick={() => onCopy(threat.ioc)}>
                  {copied === threat.ioc ? "COPIED" : copied === `failed:${threat.ioc}` ? "COPY FAILED" : "COPY"}
                </button>
              </div>
            </div>
            <div>
              <small>IOC Type</small>
              <span>{threat.type}</span>
            </div>
            <div>
              <small>Source</small>
              <span>{threat.source}</span>
            </div>
            <div>
              <small>Detection Time</small>
              <TimeAgo at={threat.detectedAt} />
            </div>
          </div>

          <div className="description-box">
            <small>Description</small>
            <p>{threat.description}</p>
          </div>
        </>
      )}
    </Modal>
  );
}

// "Last update: N sec ago". Lives in its own component so the 1 s tick no longer re-renders the whole page.
// The parent re-keys it whenever the threat list changes, which restarts the count.
function LastUpdate() {
  const [born] = useState(() => Date.now());
  const [now, setNow] = useState(born);
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);
  return <small>Last update: {Math.floor((now - born) / 1000)} sec ago</small>;
}

export default function ThreatIntelligence() {
  const { threats, markReviewed, sev, totalThreats } = useThreats(); // shared with the Command Center
  // filters live in a module-level store so they survive switching tabs (the page remounts on every tab change)
  const [search, setSearch] = usePersistedFilter("search");
  const [severity, setSeverity] = usePersistedFilter("severity");
  const [type, setType] = usePersistedFilter("type");
  const [source, setSource] = usePersistedFilter("source");
  const [sort, setSort] = usePersistedFilter("sort");
  const { status: fleetStatus } = useFleet();
  const [selectedId, setSelectedId] = useState(null);
  const [copied, setCopied] = useState("");

  // always show the live version of the selected threat (e.g. after "Mark as Reviewed")
  const selectedThreat = useMemo(
    () => threats.find((threat) => threat.id === selectedId) || null,
    [threats, selectedId]
  );
  const selectThreat = useCallback((threat) => setSelectedId(threat.id), []);
  const closeDetails = useCallback(() => setSelectedId(null), []);

  const sources = [...new Set(threats.map((threat) => threat.source))];

  // same totals as the Command Center (they include older threats that rolled out of the visible list)
  const counts = { total: totalThreats, ...sev };
  const series = useThreatSeries(12);
  const sparks = useThreatSeries(8);

  const visibleThreats = useMemo(() => {
    const normalizedSearch = search.trim().toLowerCase();

    const filtered = threats.filter((threat) => {
      const searchableText = [
        threat.name,
        threat.ioc,
        threat.source,
        threat.type,
        threat.status,
        threat.severity,
      ]
        .join(" ")
        .toLowerCase();

      const matchesSearch =
        normalizedSearch === "" || searchableText.includes(normalizedSearch);

      const matchesSeverity =
        severity === "All" || threat.severity === severity;

      const matchesType = type === "All" || threat.type === type;

      const matchesSource = source === "All" || threat.source === source;

      return matchesSearch && matchesSeverity && matchesType && matchesSource;
    });

    return [...filtered].sort((a, b) => {
      if (sort === "Oldest") {
        return new Date(a.detectedAt) - new Date(b.detectedAt);
      }

      if (sort === "Highest severity") {
        return severityOrder[b.severity] - severityOrder[a.severity];
      }

      return new Date(b.detectedAt) - new Date(a.detectedAt);
    });
  }, [search, severity, type, source, sort, threats]);

  const handleCopy = async (ioc) => {
  const ok = await copyText(ioc);
  if (ok) {
    setCopied(ioc);
    window.setTimeout(() => setCopied(""), 1400);
  } else {
    setCopied(`failed:${ioc}`);
    window.setTimeout(() => setCopied(""), 2200);
  }
 };

  const resetFilters = () => {
    setSearch("");
    setSeverity("All");
    setType("All");
    setSource("All");
    setSort("Newest");
  };

  return (
    <div className="threat-page">
      <header className="threat-header">
        <div className="live-monitoring">
          <span className={`live-status ${fleetStatus === "running" ? "" : "is-off"}`}>
            <span className="live-dot" />
            {fleetStatus === "running" ? "LIVE" : fleetStatus.toUpperCase()}
          </span>
          <LastUpdate key={totalThreats} />
        </div>
      </header>

      <section className="stats-grid" aria-label="Threat statistics">
        <div className="stat-card total">
          <span>Total threats</span>
          <strong>{counts.total}</strong>
          <Sparkline variant="total" values={sparks.total8} />
        </div>

        <div className="stat-card critical">
          <span>Critical</span>
          <strong>{counts.critical}</strong>
          <Sparkline variant="critical" values={sparks.bySeverity.critical} />
        </div>

        <div className="stat-card high">
          <span>High</span>
          <strong>{counts.high}</strong>
          <Sparkline variant="high" values={sparks.bySeverity.high} />
        </div>

        <div className="stat-card medium">
          <span>Medium</span>
          <strong>{counts.medium}</strong>
          <Sparkline variant="medium" values={sparks.bySeverity.medium} />
        </div>

        <div className="stat-card low">
          <span>Low</span>
          <strong>{counts.low}</strong>
          <Sparkline variant="low" values={sparks.bySeverity.low} />
        </div>
      </section>

      <section className="filters" aria-label="Threat filters">
        <label className="search-box">
          <span>⌕</span>
          <input
            type="search"
            name="threat-search"
            placeholder="Search threat, IOC or source..."
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </label>

        <select
          value={severity}
          onChange={(event) => setSeverity(event.target.value)}
          aria-label="Filter by severity"
          name="filter-severity"
        >
          <option value="All">Severity: All</option>
          <option value="Critical">Severity: Critical</option>
          <option value="High">Severity: High</option>
          <option value="Medium">Severity: Medium</option>
          <option value="Low">Severity: Low</option>
        </select>

        <select
          value={type}
          onChange={(event) => setType(event.target.value)}
          aria-label="Filter by IOC type"
          name="filter-type"
        >
          <option value="All">Type: All</option>
          <option value="IP">Type: IP</option>
          <option value="Domain">Type: Domain</option>
          <option value="Hash">Type: Hash</option>
          <option value="URL">Type: URL</option>
          <option value="Email">Type: Email</option>
        </select>

        <select
          value={source}
          onChange={(event) => setSource(event.target.value)}
          aria-label="Filter by source"
          name="filter-source"
        >
          <option value="All">Source: All</option>
          {sources.map((item) => (
            <option key={item} value={item}>
              Source: {item}
            </option>
          ))}
        </select>

        <select
          value={sort}
          onChange={(event) => setSort(event.target.value)}
          aria-label="Sort threats"
          name="sort-threats"
        >
          <option value="Newest">Sort: Newest</option>
          <option value="Oldest">Sort: Oldest</option>
          <option value="Highest severity">
            Sort: Highest severity
          </option>
        </select>

        <button type="button" className="reset-button" onClick={resetFilters}>
          Reset
        </button>
      </section>

      <ThreatActivityChart criticalCount={counts.critical} total={counts.total} values={series.values} />

      <div className="feed-heading">
        <div>
          <p className="eyebrow">DETECTED INDICATORS</p>
          <h2>Threat feed</h2>
        </div>

        <span>{visibleThreats.length} results</span>
      </div>

      <section className="threat-list" aria-live="polite">
        {visibleThreats.length > 0 ? (
          visibleThreats.map((threat) => (
            <ThreatCard
              key={threat.id}
              threat={threat}
              onSelect={selectThreat}
            />
          ))
        ) : (
          <div className="empty-state">
            <span className="empty-icon">◌</span>
            <h3>No threats found</h3>
            <p>Try changing your search or reset the filters.</p>
            <button
              type="button"
              className="reset-button"
              onClick={resetFilters}
            >
              Clear filters
            </button>
          </div>
        )}
      </section>

      <ThreatDetails
        threat={selectedThreat}
        onClose={closeDetails}
        onReviewed={markReviewed}
        copied={copied}
        onCopy={handleCopy}
      />
    </div>
  );
}
