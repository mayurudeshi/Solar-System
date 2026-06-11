import { useStore } from '../state/useStore.js';

// Glass-morphic top bar — extends the POC's aesthetic. v1 wires every
// toggle to the store. Scaffold renders the chrome with disabled-feeling
// controls so we can verify the look + deploy pipeline.
//
// Per-field selectors (vs destructuring the whole store) are an idiomatic
// zustand v5 hygiene choice — each selector independently subscribes to
// its slice, so a change to one field doesn't re-render everything else.
export function ControlBar() {
  const speed             = useStore((s) => s.speed);
  const paused            = useStore((s) => s.paused);
  const setSpeed          = useStore((s) => s.setSpeed);
  const togglePause       = useStore((s) => s.togglePause);
  const showOrbits        = useStore((s) => s.showOrbits);
  const toggleOrbits      = useStore((s) => s.toggleOrbits);
  const showLabels        = useStore((s) => s.showLabels);
  const toggleLabels      = useStore((s) => s.toggleLabels);
  const showApsides       = useStore((s) => s.showApsides);
  const toggleApsides     = useStore((s) => s.toggleApsides);
  const trueInclination   = useStore((s) => s.trueInclination);
  const toggleInclination = useStore((s) => s.toggleInclination);

  return (
    <div className="control-bar">
      <label className="ctrl">
        <span className="ctrl-label">Speed</span>
        <input
          type="range" min="0" max="8" step="0.1"
          value={speed} onChange={(e) => setSpeed(parseFloat(e.target.value))}
        />
        <span className="ctrl-val">{speed.toFixed(1)}×</span>
      </label>

      <button className="btn" onClick={togglePause} aria-label="pause">
        {paused ? '►' : '❚❚'}
      </button>

      <label className="toggle">
        <input type="checkbox" checked={showOrbits} onChange={toggleOrbits} /> orbits
      </label>
      <label className="toggle">
        <input type="checkbox" checked={showLabels} onChange={toggleLabels} /> labels
      </label>
      <label className="toggle">
        <input type="checkbox" checked={showApsides} onChange={toggleApsides} /> peri/apo
      </label>
      <label className="toggle">
        <input type="checkbox" checked={trueInclination} onChange={toggleInclination} /> inclination
      </label>

      <span className="hint">click a planet for data · scroll to zoom</span>
    </div>
  );
}
