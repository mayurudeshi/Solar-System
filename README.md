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

**v1.7 — locked 2026-06-14. The Milky Way (the deep-void backdrop).**

Zoom out past the solar system and the real galaxy blooms in; zoom back and
v1.6 stays perfectly pristine. The "inside vs outside" line is `cameraDist`:
≤300 invisible (planet study + the ~110 full-system overview), fading
300→1000, full galaxy out to the 1600 max-zoom.

- **Real Milky Way, not a fake.** The backdrop is a genuine all-sky
  photographic panorama (Solar System Scope, CC-BY 4.0) containing the actual
  galaxy — star clouds, the Sagittarius core, dust rifts, both Magellanic
  Clouds. We just exposure-tone-map it (`1 - exp(-raw * 14)`) so the real,
  very-dark structure reads dramatically while highlights roll off (no blown
  white wall). It's a band, not a face-on spiral — because we live *inside*
  the disk, so that's the only honest way to see our own galaxy. Orbit the
  void and it behaves like real sky: rich toward the plane, sparse toward the
  galactic poles. (An earlier hand-painted procedural band was scrapped — it
  read as a searchlight slab.)
- **Subtle star twinkle.** A forgivable "lie" (space has no atmosphere to
  scintillate), so it's restricted to compact bright stars; the diffuse band
  stays steady (correct). Low amplitude, per-star phase.
- **Occasional shooting stars.** Also a lie (meteors burn up in *Earth's*
  atmosphere), kept honest-ish by being rare and ambient: a tapered trail of
  additive point sprites (bright head → faint tail), spawned into the camera's
  view cone so they actually land on-screen, ~one every 4–9s, void-only so the
  planet view stays clean.
- Implementation notes: drive shader uniforms via the **material ref** (R3F
  clones the `uniforms` prop, so mutating it never reaches the GPU); render
  custom line/points objects via `<primitive>` (R3F's `<line>` attaches
  geometry/material unreliably).

---

**v1.6 — locked 2026-06-13. Visibility + camera control.**

- **Per-planet visibility** — a Bodies panel with a checkbox per planet;
  hiding one hides its mesh + orbit + apsis markers + moons as a unit.
  Sun is hardwired on (locked row). "Show all" / "Only Sun" shortcuts for
  isolating or comparing bodies ("Sun + Jupiter + Saturn + Neptune").
- **Vantage dropdown** — single select, fixed the duplicate "Sun Sun"
  (old segmented list did `['sun', ...BODY_NAMES]` and BODY_NAMES already
  had Sun).
- **Follow-cam** — tracks a body's motion and adds it to camera + target
  instead of hard-snapping, so framing (zoom/pan/rotate) is preserved and
  a fast body (Pluto at 100×) stays in frame.
- **Panning** — on-screen PanPad (d-pad, press-and-hold, recenter) +
  arrow keys + context-menu suppression, so "scroll around" a zoomed view
  works without colliding with browser mouse gestures.
- **Uranus** atmospheric white storm spot, locked to its 98°-tilted spin
  so its sideways rotation is finally visible.
- Edge cases: hide the ridden planet → vantage falls to Sun; pick a hidden
  planet's vantage → it auto-shows.

---

**v1.5 — locked 2026-06-13. The Sun overhaul.** Built with a headless
WebGL render harness (`tools/render_sun.mjs`) so shader changes could be
seen + iterated directly instead of guessed blind.

- **Photosphere banding eliminated.** Differential rotation on a static
  texture sheared it into latitude bands over long sessions (the "wind
  effect"). Switched to solid-body rotation → zero inter-latitude shear →
  can never band, verified at a 2500-sim-day soak.
- **Particle CMEs replace the concentric "trail shell" rings.** Plumes
  erupt from the limb, travel outward (capped short of planet orbits),
  warm-orange→red, no white-hot kernel. Rotate with the surface so they
  stay anchored to their origin spot.
- **Surface flares / active regions** rendered IN the photosphere shader
  as genuine brightenings across the whole disc, weighted to the activity
  belts (~±35°), brief flashes, never a "disco ball" or pasted-sprite look.
- Earth/Venus/Neptune now show A/P apsis markers (threshold bug fixed).
- Ariel + Titania (Uranus moons) added with Voyager 2 imagery + tidal lock.
- Earth cloud layer; real tidal-lock phase for all moons; zoom meter;
  wider speed slider.

(The earlier experimental procedural-photosphere code under
`src/scene/sun-v15/` is SUPERSEDED — its goals were achieved on the live
textured Sun instead. Parked behind a default-off flag; safe to delete.)

---

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

- **v1.5 Sun overhaul — IN-PROGRESS, parked behind feature flag.**
  Scaffolding shipped 2026-06-12 (see `src/scene/sun-v15/`). Live behind
  `useStore.sunV15` — UI toggle removed per MJ to prevent accidental
  flipping; flip via devtools console
  `useStore.getState().toggleSunV15()`. Current state has all the
  structural pieces (procedural photosphere, particle CMEs, wisp limb,
  corona) but the visual tuning is wrong: disc reads blotchy,
  particles read cartoonish, rotation still produces band-like
  artifacts even with 3D-noise sampling. Resume in a screen-share
  iteration where MJ + Claude can co-iterate on tunings in real time
  instead of guessing values blind.

  The current Sun has hit the ceiling of what's possible with a static
  H-alpha texture + surface shader. Two limitations the current
  approach can't escape:

  1. **Differential rotation smears static texture content into
     latitude bands** ("wind effect" / rings that grow over long
     viewing sessions — the same texture features at adjacent latitudes
     drift apart longitudinally over time). Noise overlays can mask
     this faintly but anything strong enough to fully hide the banding
     reads as a smudgy dirt layer over the surface.

  2. **CMEs can't render as true wispy filaments** extending outward
     into space — surface shaders are bound to the sphere they paint
     on; the current "stacked trail shells" approach gives a lift-off
     read but cannot achieve the volumetric tendril visuals of real
     LASCO coronagraph footage.

  Real fix: generate the photosphere ENTIRELY from animated 3D noise
  (curl noise / fbm / domain warping) — no static texture, no static
  content to smear. Differential rotation becomes a velocity field
  applied to the noise sampling. Granulation cells emerge naturally
  from the noise. Active regions become brighter zones with their own
  pseudo-random lifetime. CMEs become particle clusters spawned from
  active regions, traveling radially outward with fading trails (true
  volumetric tendrils, no longer constrained to a sphere). Estimated
  3-5 hours; complete replacement of `Photosphere`, `SunProminences`,
  `SunCMETrails` components.
- **Uranus rotation visibility.** Uranus' real texture has so little
  longitudinal variation that even at its fast 17.24-hour spin, MJ can
  barely tell it's rotating (only the limb gives it away). Add a
  procedural overlay to the Uranus material that introduces 1-2 faint
  bright storm-spots and/or subtle latitude bands rotating with the
  planet. JWST imagery from 2023 actually shows Uranus has faint band
  structure and occasional bright atmospheric features, so this is
  honest-ish rather than invention. Approach: shader-level UV-shifted
  fbm overlay on the existing texture, modulated by spinEpochMs at the
  same rate as the planet spin. ~30-60 min. Same fix likely applies to
  Mercury (featureless at our scale) — check before shipping.
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
