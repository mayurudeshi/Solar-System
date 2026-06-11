import { useEffect } from 'react';
import { useStore } from '../state/useStore.js';
import { BODIES } from '../data/bodies.js';

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

export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const setSelected = useStore((s) => s.setSelected);
  const body = selected ? BODIES[selected] : null;

  useEffect(() => {
    if (!body) return;
    const onKey = (e) => { if (e.key === 'Escape') setSelected(null); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [body, setSelected]);

  return (
    <aside
      className={`info-panel${body ? ' show' : ''}`}
      role="dialog"
      aria-labelledby="info-panel-title"
      aria-hidden={!body}
    >
      <button
        className="info-close"
        onClick={() => setSelected(null)}
        aria-label="Close info panel"
      >
        ✕
      </button>
      {body && (
        <>
          <h2 id="info-panel-title">
            <span className="info-swatch" style={{ background: body.color }} />
            {selected}
          </h2>
          {body.isStar ? <StarPanel body={body} /> : <PlanetPanel body={body} />}
        </>
      )}
    </aside>
  );
}
