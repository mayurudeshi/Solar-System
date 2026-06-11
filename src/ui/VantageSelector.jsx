import { useStore } from '../state/useStore.js';
import { BODY_NAMES } from '../data/bodies.js';

// Segmented Sun · Mercury · Venus · ... · Pluto · Free selector.
// Collapses to a native <select> below 600px to save mobile real estate.
export function VantageSelector() {
  const vantage = useStore((s) => s.vantage);
  const setVantage = useStore((s) => s.setVantage);
  const options = ['sun', ...BODY_NAMES, 'free'];
  const labelFor = (v) => (v === 'sun' ? 'Sun' : v === 'free' ? 'Free' : v);

  return (
    <div className="vantage">
      <span className="vantage-label">Vantage</span>

      {/* Desktop / wide */}
      <div className="seg vantage-seg-desktop" role="radiogroup" aria-label="Camera vantage point">
        {options.map((v) => (
          <button
            key={v}
            className={`seg-btn${vantage === v ? ' on' : ''}`}
            onClick={() => setVantage(v)}
            role="radio"
            aria-checked={vantage === v}
            aria-label={`Vantage: ${labelFor(v)}`}
          >
            {labelFor(v)}
          </button>
        ))}
      </div>

      {/* Mobile / narrow */}
      <select
        className="vantage-select-mobile"
        value={vantage}
        onChange={(e) => setVantage(e.target.value)}
        aria-label="Camera vantage point"
      >
        {options.map((v) => (
          <option key={v} value={v}>{labelFor(v)}</option>
        ))}
      </select>
    </div>
  );
}
