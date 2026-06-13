import { useState } from 'react';
import { useStore } from '../state/useStore.js';
import { BODIES, PLANET_NAMES } from '../data/bodies.js';

// v1.6 — per-planet visibility. A collapsible "Bodies" panel: one checkbox
// per planet (planet + its orbit + apsis markers + moons toggle as a unit),
// plus "Show all" / "Only Sun" shortcuts. The Sun is always on (shown as a
// locked row) — it's the hero, never hideable.
export function BodyVisibilityPanel() {
  const [open, setOpen] = useState(false);
  const bodyVisible   = useStore((s) => s.bodyVisible);
  const toggleBody    = useStore((s) => s.toggleBody);
  const showOnlySun   = useStore((s) => s.showOnlySun);
  const showAllBodies = useStore((s) => s.showAllBodies);

  const shownCount = PLANET_NAMES.filter((n) => bodyVisible[n]).length;

  return (
    <div className="bodies">
      <button
        className="btn bodies-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        title="Show/hide individual planets"
      >
        Bodies <span className="bodies-count">{shownCount}/{PLANET_NAMES.length}</span> {open ? '▾' : '▸'}
      </button>

      {open && (
        <div className="bodies-panel" role="group" aria-label="Planet visibility">
          <div className="bodies-actions">
            <button className="btn-sm" onClick={showAllBodies}>Show all</button>
            <button className="btn-sm" onClick={showOnlySun}>Only Sun</button>
          </div>

          {/* Sun — always on, locked */}
          <label className="body-row body-row-locked" title="The Sun is always visible">
            <input type="checkbox" checked readOnly disabled />
            <span className="body-dot" style={{ background: '#ff7a18' }} />
            <span className="body-name">Sun</span>
            <span className="body-lock">locked</span>
          </label>

          {PLANET_NAMES.map((name) => (
            <label key={name} className="body-row">
              <input
                type="checkbox"
                checked={!!bodyVisible[name]}
                onChange={() => toggleBody(name)}
              />
              <span className="body-dot" style={{ background: BODIES[name].color }} />
              <span className="body-name">{name}</span>
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
