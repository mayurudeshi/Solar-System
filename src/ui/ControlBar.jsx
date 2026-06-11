import { useStore } from '../state/useStore.js';

// Speed slider is LOG-SCALED: slider position 0-100 (linear) maps to
//   speed = 10^((pos - 50) / 25)
// giving 0.01× at pos 0, 0.1× at 25, 1× at 50, 10× at 75, 100× at 100.
// This gives fine control everywhere — fractional days at the bottom,
// "Pluto orbit in minutes" at the top.
const SLIDER_MIN = 0;
const SLIDER_MAX = 100;
const SLIDER_STEP = 1;

function sliderToSpeed(pos) {
  return Math.pow(10, (pos - 50) / 25);
}
function speedToSlider(speed) {
  return 50 + 25 * Math.log10(speed);
}
function formatSpeed(speed) {
  if (speed < 1)  return `${speed.toFixed(2)}×`;
  if (speed < 10) return `${speed.toFixed(2)}×`;
  return `${Math.round(speed)}×`;
}

export function ControlBar() {
  const speed              = useStore((s) => s.speed);
  const paused             = useStore((s) => s.paused);
  const setSpeed           = useStore((s) => s.setSpeed);
  const togglePause        = useStore((s) => s.togglePause);
  const showOrbits         = useStore((s) => s.showOrbits);
  const toggleOrbits       = useStore((s) => s.toggleOrbits);
  const showLabels         = useStore((s) => s.showLabels);
  const toggleLabels       = useStore((s) => s.toggleLabels);
  const showApsides        = useStore((s) => s.showApsides);
  const toggleApsides      = useStore((s) => s.toggleApsides);
  const trueInclination    = useStore((s) => s.trueInclination);
  const toggleInclination  = useStore((s) => s.toggleInclination);
  const showRotation       = useStore((s) => s.showRotation);
  const toggleRotation     = useStore((s) => s.toggleRotation);
  const slowRotation       = useStore((s) => s.slowRotation);
  const toggleSlowRotation = useStore((s) => s.toggleSlowRotation);

  const sliderPos = speedToSlider(speed);

  return (
    <div className="control-bar">
      <label className="ctrl">
        <span className="ctrl-label">Speed</span>
        <input
          type="range"
          min={SLIDER_MIN} max={SLIDER_MAX} step={SLIDER_STEP}
          value={sliderPos}
          onChange={(e) => setSpeed(sliderToSpeed(parseFloat(e.target.value)))}
          aria-label="Simulation speed"
        />
        <span className="ctrl-val">{formatSpeed(speed)}</span>
      </label>

      <button className="btn" onClick={togglePause} aria-label={paused ? 'Resume' : 'Pause'}>
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
      <label className="toggle">
        <input type="checkbox" checked={showRotation} onChange={toggleRotation} /> rotation
      </label>
      <label
        className="toggle"
        title={showRotation ? 'Damp rotation speed ÷10 for studying close-ups' : 'Enable rotation first'}
        style={{ opacity: showRotation ? 1 : 0.4 }}
      >
        <input
          type="checkbox"
          checked={slowRotation}
          onChange={toggleSlowRotation}
          disabled={!showRotation}
        /> slow
      </label>

      <span className="hint">click a planet for data · scroll to zoom</span>
    </div>
  );
}
