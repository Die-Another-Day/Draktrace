// Small frame-rate readout for checking the app on a real machine. Open the app with ?perf in the URL (or press Alt+P).
// Shows fps, the slowest frame of the last 5 s, whether auto "lite" mode kicked in, and which GPU the browser really uses.
// If the GPU line says SwiftShader / llvmpipe / Software, the browser is rendering WebGL on the CPU and low fps is expected.
import { useEffect, useState } from 'react';

function gpuName() {
  try {
    const gl = document.createElement('canvas').getContext('webgl');
    const ext = gl && gl.getExtension('WEBGL_debug_renderer_info');
    const name = ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl ? 'WebGL on (GPU name hidden by browser)' : 'no WebGL';
    gl?.getExtension('WEBGL_lose_context')?.loseContext(); // do not keep a spare WebGL context alive just for the name
    return name;
  } catch {
    return 'no WebGL';
  }
}

const style = {
  position: 'fixed', right: 10, bottom: 10, zIndex: 2000, padding: '8px 10px', borderRadius: 8, pointerEvents: 'none',
  background: 'rgba(3,6,10,.88)', border: '1px solid rgba(53,216,239,.35)', color: '#d6e2ea',
  font: '11px/1.5 "JetBrains Mono", monospace', whiteSpace: 'pre',
};

export default function PerfOverlay() {
  const [on, setOn] = useState(() => new URLSearchParams(window.location.search).has('perf'));
  const [info, setInfo] = useState(null);
  const [gpu, setGpu] = useState('');

  useEffect(() => {
    const onKey = (e) => { if (e.altKey && e.key.toLowerCase() === 'p') setOn((v) => !v); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  useEffect(() => {
    if (!on) return undefined;
    setGpu((g) => g || gpuName()); // looked up only when the overlay is shown (it opens a WebGL context)
    let raf = 0, last = performance.now(), frames = 0, mark = last, worst = 0, worstSince = last;
    const tick = (now) => {
      frames += 1;
      worst = Math.max(worst, now - last); last = now;
      if (now - worstSince > 5000) { worst = 0; worstSince = now; }
      if (now - mark >= 500) {
        setInfo({ fps: Math.round((frames * 1000) / (now - mark)), worst: Math.round(worst) });
        frames = 0; mark = now;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [on]);

  if (!on || !info) return null;
  const lite = document.documentElement.classList.contains('perf-lite');
  return (
    <div style={style} data-testid="perf-overlay">
      {`${info.fps} fps   worst frame ${info.worst} ms (5 s)\nlite mode: ${lite ? 'ON' : 'off'}   dpr ${window.devicePixelRatio}\nGPU: ${gpu}`}
    </div>
  );
}
