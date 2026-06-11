import { useStore } from '../state/useStore.js';

// First-class date control. Reads/writes the store's epochMs (numeric).
// JPL Keplerian elements set is valid 1800-01-01 → 2050-12-31; we cap to
// that range with a warning when dragged outside.
const MIN_MS = Date.UTC(1800, 0, 1);
const MAX_MS = Date.UTC(2050, 11, 31);

function toInputValue(epochMs) {
  // Defensive: epochMs is a number in the store; bad values produce ""
  // rather than crashing toISOString.
  const ms = Number(epochMs);
  if (!Number.isFinite(ms)) return '';
  const d = new Date(ms);
  if (!Number.isFinite(d.getTime())) return '';
  return d.toISOString().slice(0, 10);
}

export function DateScrubber() {
  const epochMs = useStore((s) => s.epochMs);
  const setEpochMs = useStore((s) => s.setEpochMs);

  const outOfRange = epochMs < MIN_MS || epochMs > MAX_MS;

  return (
    <div className="date-scrubber">
      <span className="date-label">Date</span>
      <input
        type="date"
        value={toInputValue(epochMs)}
        min="1800-01-01"
        max="2050-12-31"
        onChange={(e) => {
          const v = e.target.value;
          if (!v) return;
          const ms = Date.parse(v + 'T00:00:00Z');
          if (Number.isFinite(ms)) setEpochMs(ms);
        }}
        aria-label="Simulation date"
      />
      <button className="btn-sm" onClick={() => setEpochMs(Date.now())} aria-label="Reset date to now">
        now
      </button>
      {outOfRange && (
        <span className="warn">positions approximate (outside JPL 1800-2050)</span>
      )}
    </div>
  );
}
