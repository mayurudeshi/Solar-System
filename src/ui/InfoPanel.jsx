import { useEffect } from 'react';
import { useStore } from '../state/useStore.js';
import { BODIES } from '../data/bodies.js';
import { MOONS } from '../data/moons.js';

function fmt(n) { return n.toLocaleString(); }

function rotationText(rotHrs) {
  const abs = Math.abs(rotHrs);
  const retro = rotHrs < 0 ? ' (retrograde)' : '';
  return abs >= 48
    ? `${(abs / 24).toFixed(1)} days${retro}`
    : `${abs.toFixed(1)} hrs${retro}`;
}

function yearText(periodYrs) {
  return periodYrs < 1
    ? `${(periodYrs * 365).toFixed(0)} days`
    : `${periodYrs.toFixed(1)} yrs`;
}

function StarPanel({ body }) {
  return (
    <>
      <p className="info-sub">
        {body.spectral_type} · age {body.age_gyr} Gyr
      </p>
      <table className="info-table">
        <tbody>
          <tr><td>Diameter</td><td>{fmt(body.dia)} km</td></tr>
          <tr><td>vs Earth</td><td>{(body.dia / 12742).toFixed(0)}×</td></tr>
          <tr><td>Mass</td><td>{body.mass_kg.toExponential(2)} kg</td></tr>
          <tr><td>vs Earth mass</td><td>{fmt(body.mass_earth)}×</td></tr>
          <tr><td>Surface gravity</td><td>{body.gravity_ms2} m/s²</td></tr>
          <tr><td>Surface temp</td><td>{fmt(body.surface_temp_c)}°C</td></tr>
          <tr><td>Core temp</td><td>{fmt(body.core_temp_c)}°C</td></tr>
          <tr><td>Composition</td><td>{body.composition}</td></tr>
          <tr><td>Spectral type</td><td>{body.spectral_type}</td></tr>
          <tr><td>Rotation</td><td>{rotationText(body.rot)} (equator)</td></tr>
          <tr><td>Axial tilt</td><td>{body.axial}° (to ecliptic)</td></tr>
        </tbody>
      </table>
      <p className="info-fact">{body.fact}</p>
    </>
  );
}

function PlanetPanel({ body }) {
  return (
    <>
      <p className="info-sub">
        Semi-major axis {body.a} AU · {yearText(body.period)} orbit
      </p>
      <table className="info-table">
        <tbody>
          <tr><td>Diameter</td><td>{fmt(body.dia)} km</td></tr>
          <tr><td>vs Earth</td><td>{(body.dia / 12742).toFixed(2)}×</td></tr>
          {body.mass_kg && (
            <tr><td>Mass</td><td>{body.mass_kg.toExponential(2)} kg</td></tr>
          )}
          {body.mass_earth && (
            <tr><td>vs Earth mass</td><td>{body.mass_earth.toFixed(3)}×</td></tr>
          )}
          {body.gravity_ms2 && (
            <tr><td>Surface gravity</td><td>{body.gravity_ms2.toFixed(2)} m/s²</td></tr>
          )}
          {body.mean_temp_c !== undefined && (
            <tr><td>Mean temp</td><td>{body.mean_temp_c}°C</td></tr>
          )}
          <tr><td>Day length</td><td>{rotationText(body.rot)}</td></tr>
          <tr><td>Year</td><td>{yearText(body.period)}</td></tr>
          <tr><td>Eccentricity</td><td>{body.e.toFixed(4)}</td></tr>
          <tr><td>Inclination</td><td>{body.inc.toFixed(2)}°</td></tr>
          <tr><td>Axial tilt</td><td>{body.axial.toFixed(1)}°</td></tr>
          <tr><td>Moons</td><td>{body.moons}</td></tr>
        </tbody>
      </table>
      <p className="info-fact">{body.fact}</p>
    </>
  );
}

function MoonPanel({ moon }) {
  return (
    <>
      <p className="info-sub">
        Moon of {moon.parent} · orbits at {fmt(Math.round(moon.a_km))} km in {moon.period_d.toFixed(2)} days
      </p>
      <table className="info-table">
        <tbody>
          <tr><td>Parent</td><td>{moon.parent}</td></tr>
          <tr><td>Diameter</td><td>{fmt(moon.dia)} km</td></tr>
          <tr><td>vs Earth's Moon</td><td>{(moon.dia / 3474).toFixed(2)}×</td></tr>
          <tr><td>Distance from parent</td><td>{fmt(Math.round(moon.a_km))} km</td></tr>
          <tr><td>Orbital period</td><td>{
            moon.period_d < 1
              ? `${(moon.period_d * 24).toFixed(2)} hrs`
              : `${moon.period_d.toFixed(2)} days`
          }</td></tr>
          <tr><td>Eccentricity</td><td>{moon.e.toFixed(4)}</td></tr>
          <tr><td>Inclination</td><td>{moon.inc.toFixed(2)}°{moon.inc > 90 ? ' (retrograde)' : ''}</td></tr>
          <tr><td>Rotation</td><td>{rotationText(moon.rot)}</td></tr>
        </tbody>
      </table>
      <p className="info-fact">{moon.fact}</p>
    </>
  );
}

export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const setSelected = useStore((s) => s.setSelected);
  const body = selected ? BODIES[selected] : null;
  const moon = selected && !body ? MOONS[selected] : null;
  const hasSelection = !!(body || moon);

  useEffect(() => {
    if (!hasSelection) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [hasSelection, setSelected]);

  const swatchColor = body?.color || moon?.color || '#ffffff';

  return (
    <aside
      className={`info-panel${hasSelection ? ' show' : ''}`}
      role="dialog"
      aria-labelledby="info-panel-title"
      aria-hidden={!hasSelection}
    >
      <button
        className="info-close"
        onClick={() => setSelected(null)}
        aria-label="Close info panel"
      >
        ✕
      </button>
      {hasSelection && (
        <>
          <h2 id="info-panel-title">
            <span className="info-swatch" style={{ background: swatchColor }} />
            {selected}
          </h2>
          {body?.isStar && <StarPanel body={body} />}
          {body && !body.isStar && <PlanetPanel body={body} />}
          {moon && <MoonPanel moon={moon} />}
        </>
      )}
    </aside>
  );
}
