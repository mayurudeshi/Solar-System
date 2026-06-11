# Solar System Explorer

3D solar system with true orbital inclination, date-accurate positions,
flyable camera, and clickable bodies. Built partly as a learning tool —
the orbital mechanics aim to be correct, not just visually plausible.

## Stack

- **React + React-Three-Fiber + drei** — declarative scene graph
- **Vite** — build
- **zustand** — UI state (selected body, vantage, toggles, date)
- **Vercel** — deploy (auto from `main`)

No leva, no QNAP mirror. GitHub is source of truth.

## Data

Per-body orbital + physical data verified against
**NASA NSSDC Planetary Fact Sheet**
(https://nssdc.gsfc.nasa.gov/planetary/factsheet/).

v1 J2000 elements will be sourced from **JPL Keplerian Elements
1800–2050 AD**
(https://ssd.jpl.nasa.gov/planets/approx_pos.html).
Pluto is not in that set — Pluto elements come from a separate NSSDC fit.

## Project structure

```
src/
  App.jsx              # composition shell
  main.jsx             # React root
  index.css            # dark glassmorphic theme (extends POC aesthetic)
  data/
    bodies.js          # NSSDC-verified planet data
    moons.js           # v1.1
  lib/
    kepler.js          # Kepler's equation solver, true anomaly
    orbital.js         # Ω/i/ω → ecliptic Cartesian transform
  state/
    useStore.js        # zustand store
  scene/
    Scene.jsx          # R3F <Canvas>, lights, controls
    Sun.jsx
    Starfield.jsx
    Planet.jsx
    Moon.jsx           # v1.1
    OrbitPath.jsx
    ApsisMarkers.jsx
    Labels.jsx
  ui/
    ControlBar.jsx     # speed / pause / toggles
    InfoPanel.jsx      # click-to-open data drawer
    VantageSelector.jsx
    DateScrubber.jsx   # first-class date control, default "now"
public/textures/       # planet + ring maps (CC-BY 4.0)
```

## Math (the important part)

Each body's heliocentric position at time t comes from:

1. Mean motion `n` and mean anomaly at J2000 `M₀` → mean anomaly at t:
   `M(t) = M₀ + n · Δt` (with linear-rate corrections per JPL).
2. Solve Kepler's equation `M = E - e·sin(E)` for eccentric anomaly E
   (Newton iteration, `lib/kepler.js`).
3. True anomaly ν from E and e.
4. Position in perifocal frame `(r·cos ν, r·sin ν, 0)`.
5. Rotate to ecliptic-J2000 via (Ω, i, ω) — `lib/orbital.js`.

The POC's x-axis tilt approximation is **NOT** used. That's what makes
Pluto's 17° tilt orient correctly relative to Neptune (and not just visibly
"high" off the plane).

## Status

Scaffold v0.1 — directory tree, dark-glass UI shell, R3F canvas with Sun
and starfield rendering. Planet rendering + orbital math land in the
next pass. v1.1 (moons) follows once planets are rock-solid.

## Roadmap

- **v1**: 8 planets + Pluto with J2000 date-accurate positions,
  proper Ω/i/ω inclination, real textures, clickable data panels,
  all vantage points, date scrubber.
- **v1.1**: major moons (Luna, Io/Europa/Ganymede/Callisto,
  Titan/Enceladus, Triton, Charon).
- **v1.2**: flybys (pre-canned cinematic camera paths).

## Dev

```bash
npm install
npm run dev
```

## Credits

Orbital data: NASA NSSDC Planetary Fact Sheet.
J2000 elements: JPL Solar System Dynamics.
Textures: Solar System Scope (CC-BY 4.0, attribution required).
