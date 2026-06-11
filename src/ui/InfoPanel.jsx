import { useStore } from '../state/useStore.js';
import { BODIES } from '../data/bodies.js';

// Slide-in data drawer keyed off useStore.selected. Renders the full
// NSSDC-verified body data plus a one-line fact.
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

export function InfoPanel() {
  const selected = useStore((s) => s.selected);
  const setSelected = useStore((s) => s.setSelected);
  const body = selected ? BODIES[selected] : null;

  return (
    <aside className={`info-panel${body ? ' show' : ''}`}>
      <button className="info-close" onClick={() => setSelected(null)}>✕</button>
      {body && (
        <>
          <h2>
            <span className="info-swatch" style={{ background: body.color }} />
            {selected}
          </h2>
          <p className="info-sub">
            Semi-major axis {body.a} AU · {yearText(body.period)} orbit
          </p>
          <table className="info-table">
            <tbody>
              <tr><td>Diameter</td><td>{fmt(body.dia)} km</td></tr>
              <tr><td>vs Earth</td><td>{(body.dia / 12742).toFixed(2)}×</td></tr>
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
      )}
    </aside>
  );
}
