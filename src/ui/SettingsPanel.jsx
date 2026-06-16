import { useState, useRef, useEffect } from 'react';
import { useStore } from '../state/useStore.js';

// ⚙ Settings — a live tuning drawer for the "magic numbers" we hand-tuned.
// Same pill + sliding-drawer look as Vantage/Bodies. Each slider writes to
// store.config; the relevant component reads it (per-frame for shader uniforms,
// reactively for React props), so dragging updates the scene live.
//
// To add a knob: add a key to `config` in useStore, add a row here, and read
// it where it matters. That's the whole contract.
const SECTIONS = [
  { title: '☀ Sun', rows: [
    { key: 'sunActivity',     label: 'Activity',         min: 0,  max: 1,  step: 0.01, fmt: (v) => v.toFixed(2) },
    { key: 'flareBrightness', label: 'Flare brightness', min: 0,  max: 3,  step: 0.05, fmt: (v) => v.toFixed(2) },
    { key: 'coronaScale',     label: 'Corona size',      min: 12, max: 60, step: 1,    fmt: (v) => `${Math.round(v)}` },
  ]},
  { title: '🌍 Earth', rows: [
    { key: 'earthAtmosphere', label: 'Atmosphere glow',  min: 0,  max: 3,  step: 0.05, fmt: (v) => v.toFixed(2) },
    { key: 'cityLights',      label: 'City lights',      min: 0,  max: 6,  step: 0.1,  fmt: (v) => v.toFixed(1) },
    { key: 'cloudOpacity',    label: 'Cloud opacity',    min: 0,  max: 1,  step: 0.05, fmt: (v) => v.toFixed(2) },
  ]},
  { title: '🌑 Moon', rows: [
    { key: 'moonCrater',      label: 'Crater depth',     min: 0,  max: 0.1, step: 0.005, fmt: (v) => v.toFixed(3) },
  ]},
  { title: '⚙ General', rows: [
    { key: 'ambient',         label: 'Ambient light',    min: 0,  max: 1,    step: 0.02, fmt: (v) => v.toFixed(2) },
    { key: 'menuAnimMs',      label: 'Menu animation',   min: 0,  max: 3000, step: 50,   fmt: (v) => `${Math.round(v)}ms` },
  ]},
];

export function SettingsPanel() {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  const config = useStore((s) => s.config);
  const setConfig = useStore((s) => s.setConfig);
  const resetConfig = useStore((s) => s.resetConfig);

  // Keep the drawer-animation CSS variable in sync with the menuAnimMs knob.
  useEffect(() => {
    document.documentElement.style.setProperty('--drawer-ms', `${config.menuAnimMs}ms`);
  }, [config.menuAnimMs]);

  // Close on click/tap outside.
  useEffect(() => {
    if (!open) return;
    const onDown = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('touchstart', onDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('touchstart', onDown);
    };
  }, [open]);

  return (
    <div className="settings" ref={ref}>
      <button
        className="bodies-toggle"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-haspopup="dialog"
        title="Tune the simulation"
      >
        ⚙ Settings
      </button>

      <div
        className={'bodies-panel settings-panel' + (open ? ' open' : '')}
        role="group"
        aria-label="Settings"
        aria-hidden={!open}
      >
        {SECTIONS.map((sec) => (
          <div key={sec.title} className="setting-section">
            <div className="setting-section-title">{sec.title}</div>
            {sec.rows.map((s) => (
              <label key={s.key} className="setting-row">
                <span className="setting-head">
                  <span className="setting-name">{s.label}</span>
                  <span className="setting-val">{s.fmt(config[s.key])}</span>
                </span>
                <input
                  type="range"
                  min={s.min} max={s.max} step={s.step}
                  value={config[s.key]}
                  onChange={(e) => setConfig(s.key, Number(e.target.value))}
                />
              </label>
            ))}
          </div>
        ))}
        <button className="btn-sm settings-reset" onClick={resetConfig}>
          Reset to defaults
        </button>
      </div>
    </div>
  );
}
