import { useStore } from '../state/useStore.js';

// Space-weather readout for the Sun vantage: where we are in the solar
// cycle, the latest flare + CME, and any CME headed for (or hitting) Earth.
// All times are sim time, UTC, same as the date readout.
function fmt(ms) {
  if (!Number.isFinite(ms)) return '—';
  const d = new Date(ms);
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getUTCFullYear()}-${p(d.getUTCMonth() + 1)}-${p(d.getUTCDate())} ${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`;
}

export function SunReadout() {
  const vantage = useStore((s) => s.vantage);
  const info = useStore((s) => s.sunInfo);
  const epochMs = useStore((s) => Math.floor(s.epochMs / 60000) * 60000);
  if (vantage !== 'sun' || !info) return null;
  const eta = info.earthETA && info.earthETA.epochMs > epochMs ? info.earthETA : null;
  const hit = info.earthImpact && epochMs - info.earthImpact.epochMs < 3 * 86400000 ? info.earthImpact : null;
  return (
    <aside className="sun-readout" aria-label="Solar activity">
      <div className="sr-title">Solar cycle {info.cycle} · sunspot no. ~{info.ssn} · {info.regions} active regions</div>
      <div>Last flare <strong>{info.lastFlare?.label ?? '—'}</strong>{info.lastFlare ? ` at ${fmt(info.lastFlare.epochMs)}` : ''}</div>
      <div>
        Last CME{' '}
        {info.lastCME
          ? <><strong>{info.lastCME.kms} km/s</strong>, {info.lastCME.widthDeg}° wide ({info.lastCME.label} flare)</>
          : '—'}
      </div>
      {eta && <div className="sr-warn">CME → Earth, ETA {fmt(eta.epochMs)} UTC at ~{eta.kms} km/s</div>}
      {hit && <div className="sr-hit">CME hit Earth {fmt(hit.epochMs)} UTC at ~{hit.kms} km/s</div>}
    </aside>
  );
}
