import { useStore } from '../state/useStore.js';

// Glass-morphic top bar — extends the POC's aesthetic. v1 wires every
// toggle to the store. Scaffold renders the chrome with disabled-feeling
// controls so we can verify the look + deploy pipeline.
export function ControlBar() {
  const {
    speed, paused, togglePause, setSpeed,
    showOrbits, toggleOrbits,
    showLabels, toggleLabels,
    showApsides, toggleApsides,
    trueInclination, toggleInclination,
  } = useStore();

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
