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

**v1.0 — locked 2026-06-11.** All v1 features shipped:

- 8 planets + Pluto with J2000 date-accurate positions (JPL Keplerian
  Elements 1800–2050 AD; NSSDC for Pluto).
- Proper Ω/i/ω → ecliptic Cartesian transform (no more POC x-tilt
  approximation). Inclination toggle flattens orbits to ecliptic.
- Real planet textures (Solar System Scope CC-BY 4.0; NASA New Horizons
  for Pluto).
- Sun: H-alpha-style chromosphere texture, differential rotation shader
  (equator ~24.5d, poles ~34.4d, sin² interp), Fresnel + fbm noise
  prominences shader, two-mode lighting (natural inverse-square vs.
  artificially uniform).
- Real planetary rotations from each body's rot period, including
  retrograde for Venus and Uranus. Toggleable + slow-mode damper.
- Clickable bodies → InfoPanel with full NSSDC data.
- All vantage points (sun, every planet, free flight).
- Logarithmic date-scaled speed control (0.001× to 100×).
- Peri/aphelion markers as billboarded P/A letters at the limb.
- Mobile responsive (top bar horizontal scroll, info panel pushed below).
- ESC closes info panel, ARIA roles in place.

## Roadmap (post v1.0)

- **v1.1**: ✅ shipped — 11 major moons (Luna; Phobos/Deimos;
  Io/Europa/Ganymede/Callisto; Titan/Enceladus; Triton; Charon)
  with NASA / mission imagery for 10 of 11.
- **v1.2**: flybys (pre-canned cinematic camera paths through the
  gas giants, inner planet sprint, Pluto encounter).
- **v1.3**: real Earth night-side map + cloud layer.

## Backlog (unscheduled — pick by impact)

- **Particle-based CME wisps (v1.4 candidate).** Current sun CMEs are
  surface shaders on stacked spheres — gives "localized ejection" reads
  well but cannot achieve true wispy filaments extending outward.
  Real fix: each CME burst spawns a particle cluster traveling
  radially outward in 3D space with fading trails. Each particle's
  own trajectory + alpha-over-time produces actual volumetric tendrils
  (the visual signature of LASCO coronagraph footage). Estimated 2-3
  hours; the current shader approach has hit its ceiling.
- **Pluto color completeness.** Current swap fixed the half-rendered
  sphere but lost the NASA enhanced-color palette. Real fix: custom
  shader that blends the NASA color mosaic across the imaged
  hemisphere with the grayscale full-coverage base everywhere else.
- **Charon equirectangular.** NASA disc projection makes the back
  hemisphere distort. Real fix: Lambert-azimuthal-to-equirectangular
  reprojection of the disc, OR hand-stitched composite with Hubble
  pre-encounter data for the unimaged side.

### Decided

- **Deimos texture** → keep color-only. 12 km diameter renders at
  pixel-scale anyway; no clean CC equirectangular exists and a fake
  one would be dishonest. Decided 2026-06-11.
- **Saturn ring quality + zoom transition** → SHIPPED 2026-06-11.
  Disc-to-particle LOD crossfade in [10, 35] scene units, ~4000
  Keplerian-advanced ice particles. See `SaturnRings` in `Planet.jsx`.

## Dev

```bash
npm install
npm run dev
```

## Credits

Orbital data: NASA NSSDC Planetary Fact Sheet.
J2000 elements: JPL Solar System Dynamics.

Textures (CC-BY 4.0 / public domain):
- Sun, Mercury, Venus, Earth (incl. cloud alpha), Mars, Jupiter,
  Saturn (incl. ring alpha), Uranus, Neptune: **Solar System Scope**
  (https://www.solarsystemscope.com/textures/) — CC-BY 4.0
- Pluto: NASA New Horizons mission global color map mosaic — public domain
  (https://science.nasa.gov/resource/pluto-global-color-map/)
