import { useStore } from '../state/useStore.js';
import { BODY_NAMES } from '../data/bodies.js';

// Segmented Sun · Mercury · Venus · ... · Pluto · Free selector.
export function VantageSelector() {
  const vantage = useStore((s) => s.vantage);
  const setVantage = useStore((s) => s.setVantage);
  const options = ['sun', ...BODY_NAMES, 'free'];

  return (
    <div className="vantage">
      <span className="vantage-label">Vantage:</span>
      <div className="seg">
        {options.map((v) => (
          <button
            key={v}
            className={`seg-btn${vantage === v ? ' on' : ''}`}
            onClick={() => setVantage(v)}
          >
            {v === 'sun' ? 'Sun' : v === 'free' ? 'Free' : v}
          </button>
        ))}
      </div>
    </div>
  );
}
