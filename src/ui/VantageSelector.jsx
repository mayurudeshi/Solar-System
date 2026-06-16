import { useState, useRef, useEffect } from 'react';
import { useStore } from '../state/useStore.js';
import { PLANET_NAMES } from '../data/bodies.js';

// Camera vantage as a CUSTOM dropdown (not a native <select>) so it shares the
// exact pill + sliding-drawer look as the Bodies panel and can animate open/
// close — a native select's option list is OS-drawn and can't be animated.
// Options: sun + planets + free. Sun appears once (PLANET_NAMES excludes it).
export function VantageSelector() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const vantage = useStore((s) => s.vantage);
  const setVantage = useStore((s) => s.setVantage);
  const options = ['sun', ...PLANET_NAMES, 'free'];
  const labelFor = (v) => (v === 'sun' ? 'Sun' : v === 'free' ? 'Free' : v);

  // Close on click/tap outside (toggle button lives inside ref).
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('pointerdown', onDown);
    return () => document.removeEventListener('pointerdown', onDown);
  }, [open]);

  return (
    <div className="vantage">
      <span className="vantage-label">Vantage</span>
      <div className="vantage-dd" ref={ref}>
        <button
          className="bodies-toggle"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-haspopup="listbox"
          title="Camera vantage point"
        >
          {labelFor(vantage)}
        </button>

        <div
          className={'bodies-panel' + (open ? ' open' : '')}
          role="listbox"
          aria-label="Camera vantage"
          aria-hidden={!open}
        >
          {options.map((v) => (
            <button
              key={v}
              type="button"
              role="option"
              aria-selected={v === vantage}
              className={'body-row vantage-option' + (v === vantage ? ' selected' : '')}
              onClick={() => { setVantage(v); setOpen(false); }}
            >
              <span className="body-name">{labelFor(v)}</span>
              {v === vantage && <span className="vantage-check">✓</span>}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
