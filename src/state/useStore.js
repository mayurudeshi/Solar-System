import { create } from 'zustand';

// Single source of truth for UI state.
//
// IMPORTANT: simulated time is stored as `epochMs` (number) — NOT a Date
// object. A fresh `new Date()` on every setDate creates a new ref every
// call, so `Object.is` zustand equality always fails and every selector
// re-renders. With epoch ms, primitive identity holds — same value = no
// re-render, even when called per-frame from the SimClock.
export const useStore = create((set) => ({
  // Simulation time
  epochMs: Date.now(),     // current "now" in the simulation
  speed: 1.0,              // multiplier on day-per-real-second base rate
  paused: false,

  // Vantage / camera target
  vantage: 'sun',          // 'sun' | 'Mercury' | ... | 'free'

  // Currently-selected body (drives the InfoPanel)
  selected: null,

  // Display toggles
  showOrbits: true,
  showLabels: true,
  showApsides: false,
  trueInclination: true,   // false = flatten orbital planes to ecliptic
  trueScale: false,        // POC default — exaggerated, ranked sizes

  // Setters
  setEpochMs:      (epochMs)       => set({ epochMs }),
  setSpeed:        (speed)         => set({ speed }),
  togglePause:     ()              => set((s) => ({ paused: !s.paused })),
  setVantage:      (vantage)       => set({ vantage }),
  setSelected:     (selected)      => set({ selected }),
  toggleOrbits:    ()              => set((s) => ({ showOrbits: !s.showOrbits })),
  toggleLabels:    ()              => set((s) => ({ showLabels: !s.showLabels })),
  toggleApsides:   ()              => set((s) => ({ showApsides: !s.showApsides })),
  toggleInclination: ()            => set((s) => ({ trueInclination: !s.trueInclination })),
  toggleScale:     ()              => set((s) => ({ trueScale: !s.trueScale })),
}));
