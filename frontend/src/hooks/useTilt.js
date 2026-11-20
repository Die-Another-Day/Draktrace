// 3D tilt toward the cursor with a moving glare highlight.
// Sets --rx / --ry (rotation) and --gx / --gy (glare position) on the element.
import { useCallback, useRef } from 'react';

const canHover = typeof window !== 'undefined' && window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function useTilt(max = 7) {
  const ref = useRef(null);
  const frame = useRef(0);

  const onMouseMove = useCallback(
    (e) => {
      if (!canHover) return;
      const el = ref.current;
      const { clientX, clientY } = e;
      cancelAnimationFrame(frame.current);
      frame.current = requestAnimationFrame(() => {
        const r = el.getBoundingClientRect(); // read once per frame, not once per mouse event
        const px = (clientX - r.left) / r.width;
        const py = (clientY - r.top) / r.height;
        // big panels tilt less so they don't swing too far
        const k = max * Math.min(1, 320 / Math.max(r.width, r.height) + 0.35);
        el.style.setProperty('--rx', `${((0.5 - py) * k).toFixed(2)}deg`);
        el.style.setProperty('--ry', `${((px - 0.5) * k).toFixed(2)}deg`);
        el.style.setProperty('--gx', `${(px * 100).toFixed(1)}%`);
        el.style.setProperty('--gy', `${(py * 100).toFixed(1)}%`);
        el.classList.add('is-tilting');
      });
    },
    [max]
  );

  const onMouseLeave = useCallback(() => {
    const el = ref.current;
    cancelAnimationFrame(frame.current);
    el.style.setProperty('--rx', '0deg');
    el.style.setProperty('--ry', '0deg');
    el.classList.remove('is-tilting');
  }, []);

  return { ref, onMouseMove, onMouseLeave };
}
