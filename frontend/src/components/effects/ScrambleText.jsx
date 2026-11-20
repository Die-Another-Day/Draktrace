// Text that "decrypts" from random glyphs into the final string.
import { useEffect, useState } from 'react';

const CHARS = 'ABCDEF0123456789#$%&@<>/\\|{}[]アカサタナハマヤラ';

export default function ScrambleText({ text, duration = 700 }) {
  const [out, setOut] = useState(text);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined; // `out` already equals text
    const start = performance.now();
    let raf;
    const tick = (now) => {
      const k = Math.min(1, (now - start) / duration);
      const fixed = Math.floor(k * text.length);
      let s = text.slice(0, fixed);
      for (let i = fixed; i < text.length; i++) {
        s += text[i] === ' ' ? ' ' : CHARS[(Math.random() * CHARS.length) | 0];
      }
      setOut(s);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [text, duration]);

  const reduce = typeof window !== 'undefined' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  return <>{reduce ? text : out}</>;
}
