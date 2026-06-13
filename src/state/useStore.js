import { create } from 'zustand';
import { PLANET_NAMES } from '../data/bodies.js';

// v1.6 — per-body visibility. Every planet (incl. Pluto) starts visible.
// The Sun is never in this map: it's hardwired ON and has no toggle.
const ALL_VISIBLE = Object.fromEntries(PLANET_NAMES.map((n) => [n, true]));

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
  paused: false,

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

  // Sets BOTH epoch sources — user-visible date jump, resyncs spin to orbit.
  setEpochMs: (epochMs) => set({ epochMs, spinEpochMs: epochMs }),

  // Internal — used by SimClock per-frame. When paused, only spin advances.
  tickSim: (deltaMs, paused) =>
    set((s) =>
      paused
        ? { spinEpochMs: s.spinEpochMs + deltaMs }
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
