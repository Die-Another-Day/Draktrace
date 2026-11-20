// Page header shared by all three tabs (decrypt-in title, occasional glitch).
import { useEffect, useState } from 'react';
import ScrambleText from '../components/effects/ScrambleText';

export function PageHeader({ eyebrow, title, description, children }) {
  // occasional glitch flicker on the title
  const [glitch, setGlitch] = useState(false);
  useEffect(() => {
    let t1;
    let t2;
    const loop = () => {
      t1 = setTimeout(() => {
        setGlitch(true);
        t2 = setTimeout(() => setGlitch(false), 420);
        loop();
      }, 6000 + Math.random() * 6000);
    };
    loop();
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
    };
  }, []);

  return (
    <div className="page-header">
      <div>
        <div className="eyebrow">
          <span className="eyebrow-dot" />
          <ScrambleText text={eyebrow} duration={500} />
        </div>
        <h1 className={`glitch ${glitch ? 'is-glitching' : ''}`} data-text={title}>
          <ScrambleText text={title} />
        </h1>
        {description && <p>{description}</p>}
      </div>
      {children && <div className="page-actions">{children}</div>}
    </div>
  );
}
