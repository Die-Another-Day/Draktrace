import React, { memo, useEffect, useRef } from "react";
import { useFleet, progressOf } from "../../context/CrawlerContext";
import { Loader } from "../../components/ui";

// inline-styled buttons cannot use :disabled, so unavailable controls are dimmed explicitly
const dim = (off) => (off ? { opacity: 0.35, cursor: "not-allowed", filter: "grayscale(0.6)" } : null);

// The crawl simulation itself lives in CrawlerContext, so it keeps running when you switch tabs
// and the Command Center, globe and rain all see the same state. This tab is the controls + telemetry view
// of the primary crawler (first entry in mock-data/crawlers.json).

const LogRow = memo(function LogRow({ l }) {
  return (
    <div style={{ display: "flex", gap: "8px", margin: "4px 0" }}>
      <span style={{ color: "#475569" }}>[{l.time}]</span>
      <span style={{ color: l.color, fontWeight: 700 }}>[{l.level}]</span>
      <span style={{ color: "#cbd5e1" }}>{l.text}</span>
    </div>
  );
});

const BADGES = {
  running: { col: "#00ff9d", bg: "rgba(0,255,157,0.1)", text: "RUNNING" },
  paused: { col: "#f59e0b", bg: "rgba(245,158,11,0.1)", text: "PAUSED" },
  stopped: { col: "#ff0055", bg: "rgba(255,0,85,0.1)", text: "STOPPED" },
  idle: { col: "#94a3b8", bg: "rgba(148,163,184,0.1)", text: "IDLE" },
};

// topology nodes in 0..1 space, created once so they do not jump when the status changes
const makeNodes = () =>
  Array.from({ length: 18 }, () => ({
    x: Math.random(),
    y: Math.random(),
    vx: (Math.random() - 0.5) * 0.002,
    vy: (Math.random() - 0.5) * 0.004,
    radius: Math.random() * 2.5 + 2,
    active: Math.random() > 0.5,
  }));

export default function CrawlerTab() {
  const { primary, logs, command, setSpeed, clearLogs } = useFleet();
  const { id, status, speed, pagesCrawled: crawled, pagesDiscovered: discovered, latency, circuit, source } = primary;
  const running = status === "running";

  const logRef = useRef(null);
  const canvasRef = useRef(null);
  const nodesRef = useRef(null);

  // keep the terminal scrolled to the newest line
  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight;
  }, [logs]);

  // Topology canvas. Animates only while crawling; otherwise it draws one still frame (no idle 60 fps loop).
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext("2d");
    if (!nodesRef.current) nodesRef.current = makeNodes();
    const nodes = nodesRef.current;
    const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
    let raf = 0;
    let w = 0;
    let h = 0;

    const fit = () => {
      w = canvas.clientWidth;
      h = canvas.clientHeight;
      canvas.width = Math.max(1, Math.round(w * dpr));
      canvas.height = Math.max(1, Math.round(h * dpr));
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };

    const draw = (k = 1) => { // k = elapsed time in 60 fps frames, so nodes drift at the same speed on 60, 120 and 144 Hz screens
      ctx.clearRect(0, 0, w, h);
      ctx.strokeStyle = "rgba(0, 255, 157, 0.05)";
      ctx.lineWidth = 1;
      ctx.beginPath();
      for (let x = 0; x < w; x += 40) {
        ctx.moveTo(x, 0);
        ctx.lineTo(x, h);
      }
      for (let y = 0; y < h; y += 40) {
        ctx.moveTo(0, y);
        ctx.lineTo(w, y);
      }
      ctx.stroke();

      ctx.strokeStyle = running ? "rgba(0, 212, 255, 0.18)" : "rgba(71, 85, 105, 0.12)";
      ctx.beginPath();
      for (let i = 0; i < nodes.length; i++) {
        for (let j = i + 1; j < nodes.length; j++) {
          const dx = (nodes[i].x - nodes[j].x) * w;
          const dy = (nodes[i].y - nodes[j].y) * h;
          if (dx * dx + dy * dy < 12100) {
            ctx.moveTo(nodes[i].x * w, nodes[i].y * h);
            ctx.lineTo(nodes[j].x * w, nodes[j].y * h);
          }
        }
      }
      ctx.stroke();

      for (const n of nodes) {
        if (running) {
          n.x += n.vx * speed * k;
          n.y += n.vy * speed * k;
          if ((n.x < 0 && n.vx < 0) || (n.x > 1 && n.vx > 0)) n.vx *= -1; // only bounce when moving outward, so a node never sticks on the edge
          if ((n.y < 0 && n.vy < 0) || (n.y > 1 && n.vy > 0)) n.vy *= -1;
        }
        const px = n.x * w;
        const py = n.y * h;
        ctx.fillStyle = running ? (n.active ? "#00ff9d" : "#00d4ff") : "#475569";
        ctx.beginPath();
        ctx.arc(px, py, n.radius, 0, Math.PI * 2);
        ctx.fill();
        if (running && n.active) {
          ctx.strokeStyle = "rgba(0, 255, 157, 0.4)";
          ctx.beginPath();
          ctx.arc(px, py, n.radius + 3, 0, Math.PI * 2);
          ctx.stroke();
        }
      }
    };

    let lastT = 0;
    const loop = (now) => {
      const k = lastT ? Math.min(3, (now - lastT) / 16.667) : 1;
      lastT = now;
      draw(k);
      raf = requestAnimationFrame(loop);
    };

    fit();
    if (running) raf = requestAnimationFrame(loop);
    else draw();

    const ro = new ResizeObserver(() => {
      fit();
      if (!running) draw();
    });
    ro.observe(canvas);
    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, [running, speed]);

  const progress = progressOf(primary);
  const theme = BADGES[status] || BADGES.idle;

  return (
    <div style={css.container}>
      {/* Execution controls (the page header above already carries the title) */}
      <div style={css.header}>
        <div style={css.tag}>DARKTRACE // RECON ENGINE // {primary.name.toUpperCase()}</div>

        <div style={css.row}>
          <div style={{ ...css.badge, color: theme.col, background: theme.bg, borderColor: theme.col }}>● {theme.text}</div>
          <button style={{ ...css.btn, background: "#00ff9d", color: "#020617", ...dim(running) }} onClick={() => command("start", id)} disabled={running}>
            START
          </button>
          <button style={{ ...css.btn, background: "#f59e0b", color: "#020617", ...dim(!running) }} onClick={() => command("pause", id)} disabled={!running}>
            PAUSE
          </button>
          <button style={{ ...css.btn, background: "#ff0055", color: "#fff", ...dim(status === "idle" || status === "stopped") }} onClick={() => command("stop", id)} disabled={status === "idle" || status === "stopped"}>
            STOP
          </button>
          <button style={{ ...css.btn, background: "#334155", color: "#cbd5e1" }} onClick={() => command("reset", id)}>
            RESET
          </button>
        </div>
      </div>

      {/* Target URL Card */}
      <div style={css.targetBox}>
        <div style={css.targetLabel}>TARGET: {source.name.toUpperCase()}</div>
        <div style={{ color: "#f1f5f9", fontSize: "0.9rem", wordBreak: "break-all" }}>{source.url}</div>
      </div>

      {/* Tor status & circuit */}
      <div style={css.torStatusStrip}>
        <div style={css.torItem}>
          <span style={css.torLabel}>TOR ROUTE:</span>
          <span style={{ color: running ? "#00ff9d" : "#94a3b8", fontWeight: 700 }}>{running ? "ACTIVE" : "STANDBY"}</span>
        </div>
        <div style={css.torItem}>
          <span style={css.torLabel}>CIRCUIT:</span>
          <span style={{ color: "#38bdf8", fontWeight: 600 }}>{circuit}</span>
        </div>
        <div style={css.torItem}>
          <span style={css.torLabel}>LATENCY:</span>
          <span style={{ color: latency < 190 ? "#00ff9d" : "#f59e0b", fontWeight: 700 }}>{latency}ms</span>
        </div>
      </div>

      {/* Telemetry */}
      <div style={css.grid}>
        <div style={css.card}>
          <div style={css.cardTitle}>PAGES CRAWLED</div>
          <div style={css.metricVal}>{crawled.toLocaleString()}</div>
          <div style={css.cardFoot}>Total pages fetched so far</div>
        </div>

        <div style={css.card}>
          <div style={css.cardTitle}>PAGES DISCOVERED</div>
          <div style={css.metricVal}>{discovered.toLocaleString()}</div>
          <div style={css.cardFoot}>Remaining queue: {(discovered - crawled).toLocaleString()}</div>
        </div>

        <div style={css.card}>
          <div style={css.cardTitle}>CRAWL SPEED</div>
          <div style={{ display: "flex", gap: "6px", margin: "8px 0" }}>
            {[1, 2, 5].map((s) => (
              <button key={s} onClick={() => setSpeed(id, s)} style={{ ...css.speedBtn, ...(speed === s ? css.speedActive : {}) }}>
                {s}x
              </button>
            ))}
          </div>
          <div style={css.cardFoot}>Throughput: ~{Math.round(60000 / (Math.ceil(Math.max(150, 1100 / speed) / 150) * 150))} pages/min</div>
        </div>

        <div style={css.card}>
          <div style={css.cardTitle}>PROGRESS ({progress}%)</div>
          <div style={css.progressBg}>
            <div style={{ ...css.progressBar, width: `${progress}%` }} />
          </div>
          <div style={css.cardFoot}>Pool completion: {progress}%</div>
        </div>
      </div>

      {/* Activity terminal + node visualization */}
      <div style={css.bottomWorkspace}>
        <div style={css.terminal}>
          <div style={css.terminalHead}>
            <span>● LIVE ACTIVITY LOG</span>
            <button style={css.clearBtn} onClick={clearLogs}>
              CLEAR
            </button>
          </div>
          <div style={css.terminalBody} ref={logRef}>
            {logs.map((l) => (
              <LogRow key={l.id} l={l} />
            ))}
            {running && <Loader size="sm" inline label="Awaiting next response over Tor…" className="crawler-wait" />}
            {!running && logs.length === 0 && <span style={{ color: "#64748b" }}>No activity yet. Press START to dispatch the crawler.</span>}
          </div>
        </div>

        <div style={css.vizPanel}>
          <div style={css.vizHead}>
            <span>● ONION MESH TOPOLOGY // REAL-TIME NODES</span>
            <span style={{ color: running ? "#00ff9d" : "#94a3b8", fontSize: "0.7rem" }}>{running ? <Loader size="sm" inline label="LIVE HARVEST" /> : theme.text}</span>
          </div>
          <div style={css.canvasContainer}>
            <canvas ref={canvasRef} style={{ position: "absolute", inset: 0, width: "100%", height: "100%" }} />
          </div>
        </div>
      </div>
    </div>
  );
}

const css = {
  container: {
    padding: "0",
    background: "transparent",
    fontFamily: "'JetBrains Mono', 'Courier New', monospace",
    boxSizing: "border-box"
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    paddingBottom: "16px",
    marginBottom: "16px",
    flexWrap: "wrap",
    gap: "10px"
  },
  tag: { fontSize: "0.7rem", color: "#00ff9d", letterSpacing: "2px" },
  row: { display: "flex", gap: "8px", alignItems: "center", flexWrap: "wrap" },
  badge: { padding: "5px 12px", border: "1px solid", borderRadius: "3px", fontSize: "0.75rem", fontWeight: 700 },
  btn: {
    padding: "6px 12px",
    border: "none",
    borderRadius: "3px",
    fontWeight: 700,
    cursor: "pointer",
    fontSize: "0.75rem",
    transition: "all 0.2s ease"
  },
  targetBox: {
    background: "#0f172a",
    borderLeft: "4px solid #00d4ff",
    padding: "10px 14px",
    borderRadius: "3px",
    marginBottom: "12px"
  },
  targetLabel: { fontSize: "0.68rem", color: "#00d4ff", letterSpacing: "1px", marginBottom: "3px" },
  torStatusStrip: {
    display: "flex",
    gap: "24px",
    background: "#0d1424",
    border: "1px solid #1e293b",
    borderRadius: "3px",
    padding: "8px 14px",
    marginBottom: "16px",
    fontSize: "0.75rem",
    flexWrap: "wrap"
  },
  torItem: { display: "flex", gap: "8px", alignItems: "center" },
  torLabel: { color: "#64748b", fontWeight: 700, letterSpacing: "1px" },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(180px, 100%), 1fr))",
    gap: "12px",
    marginBottom: "16px"
  },
  card: { background: "#0d1424", border: "1px solid #1e293b", padding: "14px", borderRadius: "4px" },
  cardTitle: { fontSize: "0.7rem", color: "#64748b", letterSpacing: "1px" },
  metricVal: { fontSize: "1.6rem", fontWeight: 700, color: "#f8fafc", margin: "4px 0" },
  cardFoot: { fontSize: "0.68rem", color: "#64748b" },
  speedBtn: {
    flex: 1,
    padding: "4px",
    background: "#1e293b",
    border: "1px solid #334155",
    color: "#94a3b8",
    cursor: "pointer",
    borderRadius: "2px"
  },
  speedActive: { background: "#00ff9d", color: "#020617", fontWeight: 700 },
  progressBg: {
    width: "100%",
    height: "6px",
    background: "#1e293b",
    borderRadius: "2px",
    marginTop: "10px",
    marginBottom: "6px",
    overflow: "hidden"
  },
  progressBar: { height: "100%", background: "#00ff9d", transition: "width 0.2s ease" },
  bottomWorkspace: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(min(320px, 100%), 1fr))",
    gap: "12px"
  },
  terminal: { background: "#05080f", border: "1px solid #1e293b", borderRadius: "4px", overflow: "hidden" },
  terminalHead: {
    background: "#0d1424",
    padding: "8px 12px",
    borderBottom: "1px solid #1e293b",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    color: "#cbd5e1",
    fontSize: "0.75rem"
  },
  terminalBody: { height: "220px", overflowY: "auto", padding: "10px 14px", fontSize: "0.8rem", lineHeight: "1.5" },
  clearBtn: {
    background: "transparent",
    border: "1px solid #334155",
    color: "#94a3b8",
    cursor: "pointer",
    fontSize: "0.7rem",
    padding: "2px 6px"
  },
  vizPanel: {
    background: "#05080f",
    border: "1px solid #1e293b",
    borderRadius: "4px",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column"
  },
  vizHead: {
    background: "#0d1424",
    padding: "8px 12px",
    borderBottom: "1px solid #1e293b",
    display: "flex",
    justifyContent: "space-between",
    color: "#cbd5e1",
    fontSize: "0.75rem",
    letterSpacing: "1px"
  },
  canvasContainer: { flex: 1, position: "relative", minHeight: "220px" }
};