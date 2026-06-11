import { create } from 'zustand';

// Single source of truth for UI state.
// Scene reads selected/vantage; UI components dispatch via setters.
export const useStore = create((set) => ({
  // Simulation time
  date: new Date(),         // current scrubber position; default "now"
  speed: 1.0,               // simulation speed multiplier (0 = paused)
  paused: false,

  // Vantage / camera target
  vantage: 'sun',           // 'sun' | 'Mercury' | 'Venus' | ... | 'free'

  // Currently-selected body (drives the InfoPanel)
  selected: null,

  // Display toggles
  showOrbits: true,
  showLabels: true,
  showApsides: false,
  trueInclination: true,    // false = flat ecliptic
  trueScale: false,         // POC default — exaggerated, ranked sizes

  // Setters
  setDate:        (date)        => set({ date }),
  setSpeed:       (speed)       => set({ speed }),
  togglePause:    ()            => set((s) => ({ paused: !s.paused })),
  setVantage:     (vantage)     => set({ vantage }),
  setSelected:    (selected)    => set({ selected }),
  toggleOrbits:   ()            => set((s) => ({ showOrbits: !s.showOrbits })),
  toggleLabels:   ()            => set((s) => ({ showLabels: !s.showLabels })),
  toggleApsides:  ()            => set((s) => ({ showApsides: !s.showApsides })),
  toggleInclination: ()         => set((s) => ({ trueInclination: !s.trueInclination })),
  toggleScale:    ()            => set((s) => ({ trueScale: !s.trueScale })),
}));
