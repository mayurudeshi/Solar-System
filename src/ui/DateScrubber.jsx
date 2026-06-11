import { useStore } from '../state/useStore.js';

// First-class date control. Default = "now". JPL Keplerian elements set
// is valid 1800-01-01 → 2050-12-31; we cap to that range with a warning.
const MIN = new Date('1800-01-01T00:00:00Z');
const MAX = new Date('2050-12-31T00:00:00Z');

function toInputValue(date) {
  // <input type="date" /> wants YYYY-MM-DD
  return date.toISOString().slice(0, 10);
}

export function DateScrubber() {
  const date = useStore((s) => s.date);
  const setDate = useStore((s) => s.setDate);

  const outOfRange = date < MIN || date > MAX;

  return (
    <div className="date-scrubber">
      <span className="date-label">Date</span>
      <input
        type="date"
        value={toInputValue(date)}
        min={toInputValue(MIN)}
        max={toInputValue(MAX)}
        onChange={(e) => {
          const v = e.target.value;
          if (v) setDate(new Date(v + 'T00:00:00Z'));
        }}
      />
      <button className="btn-sm" onClick={() => setDate(new Date())}>now</button>
      {outOfRange && (
        <span className="warn">positions approximate (outside JPL 1800-2050)</span>
      )}
    </div>
  );
}
