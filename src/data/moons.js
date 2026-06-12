// Major moons of the planets. Per-moon orbital elements use SIMPLIFIED
// Keplerian math relative to the parent's center — eccentricity included
// but inclination is to the parent's equator, not the ecliptic, and we
// ignore secular drift over the JPL 1800–2050 window (moon orbits change
// far less than planet orbits at the precision a learning tool needs).
//
// Sources:
//   NASA NSSDC moon fact sheets (https://nssdc.gsfc.nasa.gov/planetary/factsheet/)
//   for diameters, masses, periods, eccentricities, inclinations.
//
// Field legend (per moon):
//   parent     — body name in BODIES
//   a_km       — semi-major axis from parent center (km)
//   e          — eccentricity
//   inc        — orbital inclination (deg, to parent's equator)
//   period_d   — orbital period (Earth days)
//   dia        — diameter (km)
//   rot        — rotation period (hours). For tidally-locked moons (most),
//                this equals the orbital period × 24.
//   color      — display tint
//   fact       — one-line teaching note
//   textureUrl — optional CC-BY texture path

export const MOONS = {
  // ── Earth ────────────────────────────────────────────────────────────
  Luna: {
    parent: 'Earth',
    a_km: 384400, e: 0.0549, inc: 5.145, period_d: 27.3217,
    dia: 3474, rot: 27.3217 * 24, color: '#c8c8c0',
    textureUrl: '/textures/moons/2k_luna.jpg',
    fact: 'Tidally locked — always shows Earth the same face. Drifts away at ~3.8 cm/year. Without it, Earth would wobble chaotically on its axis.',
  },

  // ── Mars ─────────────────────────────────────────────────────────────
  Phobos: {
    parent: 'Mars',
    a_km: 9376, e: 0.0151, inc: 1.08, period_d: 0.3189,
    dia: 22.4, rot: 0.3189 * 24, color: '#8a7560',
    textureUrl: '/textures/moons/phobos.jpg',
    fact: 'Orbits Mars in just 7.6 hours — faster than Mars rotates. Rises in the west, sets in the east. Spiraling inward; will crash into Mars in ~50 million years.',
  },
  Deimos: {
    parent: 'Mars',
    a_km: 23463, e: 0.00033, inc: 1.79, period_d: 1.263,
    dia: 12.4, rot: 1.263 * 24, color: '#968070',
    fact: 'Tiny captured-asteroid moon. So low gravity (~0.003 m/s²) you could escape it with a hard jump.',
  },

  // ── Jupiter — the Galileans ──────────────────────────────────────────
  Io: {
    parent: 'Jupiter',
    a_km: 421800, e: 0.0041, inc: 0.036, period_d: 1.7691,
    dia: 3643, rot: 1.7691 * 24, color: '#e8d674',
    textureUrl: '/textures/moons/io.jpg',
    fact: 'Most volcanically active body in the solar system — 400+ active volcanoes. Tidal flexing from Jupiter + Europa + Ganymede heats its interior to molten lava.',
  },
  Europa: {
    parent: 'Jupiter',
    a_km: 671034, e: 0.009, inc: 0.466, period_d: 3.5512,
    dia: 3122, rot: 3.5512 * 24, color: '#d8c8a0',
    textureUrl: '/textures/moons/europa.jpg',
    fact: 'Smooth ice surface conceals a global liquid-water ocean with MORE volume than all of Earth\'s oceans combined. Tidal heating from Jupiter keeps it liquid. Top candidate for extraterrestrial life. NASA Europa Clipper launched 2024.',
  },
  Ganymede: {
    parent: 'Jupiter',
    a_km: 1070400, e: 0.0013, inc: 0.177, period_d: 7.1546,
    dia: 5268, rot: 7.1546 * 24, color: '#b8a888',
    textureUrl: '/textures/moons/ganymede.jpg',
    fact: 'Largest moon in the solar system — bigger than the planet Mercury. Only moon with its own magnetic field. Has a subsurface saltwater ocean too.',
  },
  Callisto: {
    parent: 'Jupiter',
    a_km: 1882700, e: 0.0074, inc: 0.192, period_d: 16.689,
    dia: 4821, rot: 16.689 * 24, color: '#948578',
    textureUrl: '/textures/moons/callisto.jpg',
    fact: 'Most heavily cratered surface known — geologically dead for ~4 billion years. The outermost Galilean. Outside Jupiter\'s main radiation belt, so a relatively safe staging point for crewed Jupiter-system missions.',
  },

  // ── Saturn — Titan + Enceladus ───────────────────────────────────────
  Titan: {
    parent: 'Saturn',
    a_km: 1221870, e: 0.0288, inc: 0.348, period_d: 15.945,
    dia: 5149, rot: 15.945 * 24, color: '#d8a85c',
    textureUrl: '/textures/moons/titan.webp',
    fact: 'Only moon in the solar system with a substantial atmosphere — denser than Earth\'s. Lakes and rivers of liquid METHANE flow across its surface. Bigger than Mercury.',
  },
  Enceladus: {
    parent: 'Saturn',
    a_km: 237948, e: 0.0047, inc: 0.019, period_d: 1.3702,
    dia: 504, rot: 1.3702 * 24, color: '#f0f0f8',
    textureUrl: '/textures/moons/enceladus.jpg',
    fact: 'Tiny moon with cryovolcanic geysers spraying water-ice plumes into space from a subsurface ocean. Cassini flew through the plumes and detected organic compounds.',
  },

  // ── Uranus — Ariel + Titania ─────────────────────────────────────────
  // Voyager 2 (1986) is the ONLY close-up imagery of any Uranian moon.
  // Textures are disc views, not equirectangular — back hemisphere
  // distorts at high zoom (same trade-off as Charon).
  Ariel: {
    parent: 'Uranus',
    a_km: 191020, e: 0.0012, inc: 0.260, period_d: 2.520,
    dia: 1157.8, rot: 2.520 * 24, color: '#c0bcb8',
    textureUrl: '/textures/moons/ariel.jpg',
    fact: 'Brightest of Uranus\'s moons. Geologically young surface with deep canyons (chasmata) cutting across — tectonic and possibly cryovolcanic activity in its past. Roughly half water ice, half rock. Voyager 2 saw it once in 1986; we have no closer imagery.',
  },
  Titania: {
    parent: 'Uranus',
    a_km: 436300, e: 0.0011, inc: 0.340, period_d: 8.706,
    dia: 1577.8, rot: 8.706 * 24, color: '#9b8870',
    textureUrl: '/textures/moons/titania.jpg',
    fact: 'Largest moon of Uranus, 8th largest moon in the solar system. Surface dominated by massive rift valleys (chasmata) stretching across its disk. Half water ice, half rock. Like all Uranus moons, only imaged by Voyager 2 (1986).',
  },

  // ── Neptune — Triton ─────────────────────────────────────────────────
  Triton: {
    parent: 'Neptune',
    a_km: 354759, e: 0.000016, inc: 156.865, period_d: 5.877,
    dia: 2706, rot: 5.877 * 24, color: '#c4b8a8',
    textureUrl: '/textures/moons/triton.jpg',
    fact: 'Orbits Neptune RETROGRADE — backwards relative to Neptune\'s rotation. Almost certainly a captured Kuiper Belt object. Slowly spiraling inward; will be torn apart by Neptune\'s tides in ~3.6 billion years.',
  },

  // ── Pluto — Charon (binary system) ───────────────────────────────────
  Charon: {
    parent: 'Pluto',
    a_km: 19591, e: 0.0, inc: 0.001, period_d: 6.3872,
    dia: 1212, rot: 6.3872 * 24, color: '#8c7d70',
    // NASA PIA19968 — New Horizons enhanced-color shot. Disc view, not
    // a true equirectangular projection, so the front hemisphere (with
    // the iconic red Mordor Macula at the pole) reads correctly while
    // the back is a stretched mirror. Acceptable trade-off for the
    // Pluto-Charon binary moment until a real equirectangular fit lands.
    textureUrl: '/textures/moons/charon.jpg',
    fact: 'Half the diameter of Pluto. Together they form a true binary — they orbit a common center of mass that lies OUTSIDE Pluto. Tidally locked to each other; both always show the same face.',
  },
};

export const MOON_NAMES = Object.keys(MOONS);

// Helper: list moons of a given parent body.
export function moonsOfParent(parentName) {
  return MOON_NAMES.filter((n) => MOONS[n].parent === parentName);
}
