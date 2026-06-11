import { useStore } from '../state/useStore.js';
import { BODIES } from '../data/bodies.js';

// Live readout of what date the SCENE is currently showing — distinct
// from the DateScrubber's input value, which only reflects the date the
// user picked, not the SimClock's continuous advancement.
//
// Selector rounds epochMs to the nearest second to avoid 60Hz re-renders;
// at any sane speed the displayed date won't change more than once per
// real second anyway.
function formatSimDate(epochMs) {
  if (!Number.isFinite(epochMs)) return '—';
  const d = new Date(epochMs);
  if (!Number.isFinite(d.getTime())) return '—';
  // YYYY-MM-DD HH:MM UTC — compact and unambiguous
  const yyyy = d.getUTCFullYear();
  const mm = String(d.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(d.getUTCDate()).padStart(2, '0');
  const hh = String(d.getUTCHours()).padStart(2, '0');
  const mi = String(d.getUTCMinutes()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd} ${hh}:${mi} UTC`;
}

function vantageLabel(v) {
  if (v === 'sun') return 'Sun-centered';
  if (v === 'free') return 'Free flight';
  return `Riding ${v}`;
}

export function SimDateReadout() {
  // Round to nearest second so the selector only fires once per real second
  const epochSec = useStore((s) => Math.floor(s.epochMs / 1000));
  const vantage = useStore((s) => s.vantage);
  const trueInclination = useStore((s) => s.trueInclination);

  return (
    <footer className="readout">
      <span className="readout-date">{formatSimDate(epochSec * 1000)}</span>
      <span className="readout-sep">·</span>
      <span>{vantageLabel(vantage)}</span>
      <span className="readout-sep">·</span>
      <span>{trueInclination ? 'true inclination' : 'flat'}</span>
    </footer>
  );
}
