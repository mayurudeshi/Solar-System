import { useStore } from '../state/useStore.js';
import { PLANET_NAMES } from '../data/bodies.js';

// Camera vantage as a single dropdown. Uses PLANET_NAMES (not BODY_NAMES)
// so the Sun appears exactly ONCE — the old segmented version did
// ['sun', ...BODY_NAMES] and BODY_NAMES already contained 'Sun', which
// rendered a duplicate "Sun  Sun" (MJ flagged 2026-06-13).
export function VantageSelector() {
  const vantage = useStore((s) => s.vantage);
  const setVantage = useStore((s) => s.setVantage);
  const options = ['sun', ...PLANET_NAMES, 'free'];
  const labelFor = (v) => (v === 'sun' ? 'Sun' : v === 'free' ? 'Free' : v);

  return (
    <div className="vantage">
      <span className="vantage-label">Vantage</span>
      <select
        className="vantage-select"
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
