import { create } from 'zustand';
import { PLANET_NAMES } from '../data/bodies.js';

// v1.6 — per-body visibility. Every planet (incl. Pluto) starts visible.
// The Sun is never in this map: it's hardwired ON and has no toggle.
const ALL_VISIBLE = Object.fromEntries(PLANET_NAMES.map((n) => [n, true]));

// Live-tunable defaults (the ⚙ Settings drawer). Grouped conceptually by
// section; flat here so setConfig(key,val) stays trivial. Each is read by its
// component (per-frame for shader uniforms, reactively for props).
const DEFAULT_CONFIG = {
  // Sun
  sunActivity: 0.55,      // 0..1   surface flare density
  flareBrightness: 1.20,  // 0..3   flare pop intensity
  coronaScale: 30,        // 12..60 corona sprite size
  // Earth
  earthAtmosphere: 1.0,   // 0..3   atmospheric rim glow multiplier
  cityLights: 2.6,        // 0..6   night-side city-lights brightness
  cloudOpacity: 1.0,      // 0..1   cloud layer opacity
  // Moon
  moonCrater: 0.035,      // 0..0.1 Luna crater relief (bump scale)
  // General
  ambient: 0.35,          // 0..1   ambient fill light
  menuAnimMs: 2000,       // 0..3000 dropdown drawer slide duration
};

// Two parallel time sources so pause can freeze orbits without freezing
// spin (MJ's observation: at high speeds, inner planets fly around the
// sun in <1 sec while their rotations stay invisible; pause should let
// you study a spin without losing your place in the orbit).
//
//   epochMs     — drives orbital position (frozen when paused)
//   spinEpochMs — drives planetary rotation (always advances at speed×)
//
// On any user-set date jump (DateScrubber's input or 'now' button), BOTH
// reset to the picked value — they only desync during a pause-and-watch.
export const useStore = create((set) => ({
  epochMs: Date.now(),
  spinEpochMs: Date.now(),
  speed: 1.0,
  paused: true,           // start frozen on today; hit Play to animate or pick any date

  vantage: 'sun',
  selected: null,

  showOrbits: true,
  showLabels: true,
  showApsides: false,
  trueInclination: true,
  trueScale: false,
  showRotation: true,
  slowRotation: false,
  naturalLight: false,     // false = uniform illumination (clarity); true = physical inverse-square falloff
  showMoons: true,         // master switch; LOD still hides them when far from parent

  // v1.6 — per-planet visibility. Hiding a planet hides its mesh, orbit,
  // apsis markers, and moons as one unit. Sun is always visible (not here).
  bodyVisible: { ...ALL_VISIBLE },

  // Camera distance to the OrbitControls target (vantage focus). Updated
  // by VantageCamera at ~10Hz so the ControlBar meter doesn't trigger a
  // 60Hz React re-render storm.
  cameraDist: 0,
  setCameraDist: (d) => set({ cameraDist: d }),

  // v1.5 Sun feature flag — toggles the experimental procedural Sun
  // (particle CMEs + 3D-noise photosphere) in Scene.jsx. Default off
  // so v1.4's stable Sun is what users see; flip on for development +
  // side-by-side comparison.
  sunV15: false,
  toggleSunV15: () => set((s) => ({ sunV15: !s.sunV15 })),

  // ── Live-tunable config (the "magic numbers" we hand-tuned, exposed in the
  // Settings ⚙ drawer). Components read these each frame and feed their
  // uniforms, so dragging a slider updates the scene live. Extensible: add a
  // key here + a slider in SettingsPanel + read it in the relevant component.
  config: { ...DEFAULT_CONFIG },
  setConfig: (key, value) =>
    set((s) => ({ config: { ...s.config, [key]: value } })),
  resetConfig: () => set({ config: { ...DEFAULT_CONFIG } }),

  // Sets BOTH epoch sources — user-visible date jump, resyncs spin to orbit.
  setEpochMs: (epochMs) => set({ epochMs, spinEpochMs: epochMs }),

  // Internal — used by SimClock per-frame. Paused = TRUE freeze frame: both
  // orbital position AND rotation hold, so a paused view (incl. the start
  // state and any date you punch in) is a clean static snapshot to study.
  tickSim: (deltaMs, paused) =>
    set((s) =>
      paused
        ? {}
        : { epochMs: s.epochMs + deltaMs, spinEpochMs: s.spinEpochMs + deltaMs }
    ),

  setSpeed:           (speed)         => set({ speed }),
  togglePause:        ()              => set((s) => ({ paused: !s.paused })),
  setSelected:        (selected)      => set({ selected }),

  // Vantage. EDGE CASE: picking a hidden planet's vantage auto-shows it
  // (you clearly want to look at it — no "camera staring at nothing").
  setVantage: (vantage) =>
    set((s) => {
      if (vantage in s.bodyVisible && !s.bodyVisible[vantage]) {
        return { vantage, bodyVisible: { ...s.bodyVisible, [vantage]: true } };
      }
      return { vantage };
    }),

  // Toggle one planet. EDGE CASE: hiding the planet you're currently
  // riding falls the vantage back to the Sun.
  toggleBody: (name) =>
    set((s) => {
      const next = !s.bodyVisible[name];
      const patch = { bodyVisible: { ...s.bodyVisible, [name]: next } };
      if (!next && s.vantage === name) patch.vantage = 'sun';
      return patch;
    }),

  // Universal OFF — only the Sun remains. Falls vantage to Sun if it was
  // on a (now-hidden) planet.
  showOnlySun: () =>
    set((s) => {
      const hidden = Object.fromEntries(PLANET_NAMES.map((n) => [n, false]));
      const patch = { bodyVisible: hidden };
      if (s.vantage !== 'sun' && s.vantage !== 'free') patch.vantage = 'sun';
      return patch;
    }),

  // Universal ON — everything back.
  showAllBodies: () => set({ bodyVisible: { ...ALL_VISIBLE } }),
  toggleOrbits:       ()              => set((s) => ({ showOrbits: !s.showOrbits })),
  toggleLabels:       ()              => set((s) => ({ showLabels: !s.showLabels })),
  toggleApsides:      ()              => set((s) => ({ showApsides: !s.showApsides })),
  toggleInclination:  ()              => set((s) => ({ trueInclination: !s.trueInclination })),
  toggleScale:        ()              => set((s) => ({ trueScale: !s.trueScale })),
  toggleRotation:     ()              => set((s) => ({ showRotation: !s.showRotation })),
  toggleSlowRotation: ()              => set((s) => ({ slowRotation: !s.slowRotation })),
  toggleNaturalLight: ()              => set((s) => ({ naturalLight: !s.naturalLight })),
  toggleMoons:        ()              => set((s) => ({ showMoons: !s.showMoons })),
}));

// Dev hook — expose the store on window so the headless render harness
// (tools/render_sun.mjs) can drive vantage/zoom/toggles programmatically
// instead of simulating UI clicks + scroll wheel. Harmless in prod (just
// a global ref); enables Claude to see its own shader changes via
// screenshot-render loop. Gated behind a try so SSR/no-window contexts
// don't choke.
try {
  if (typeof window !== 'undefined') {
    window.__solarStore = useStore;
  }
} catch (_) { /* no-op */ }
