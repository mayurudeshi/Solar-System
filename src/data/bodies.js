// Verified against NASA NSSDC Planetary Fact Sheet
// (https://nssdc.gsfc.nasa.gov/planetary/factsheet/)
//
// Per-body fields:
//   a       — semi-major axis (AU)
//   e       — eccentricity
//   inc     — orbital inclination to ecliptic (degrees)
//   lop     — longitude of perihelion (degrees) — APPROXIMATE; combines Ω + ω
//             POC field, kept for back-compat with the prototype rotation math.
//   period  — orbital period (Earth years)
//   dia     — equatorial diameter (km)
//   rot     — sidereal rotation period (hours; negative = retrograde)
//   moons   — confirmed moon count
//   axial   — axial tilt / obliquity (degrees)
//   color   — display hex
//   fact    — one-line "huh, didn't know that" — verified
//
// MISSING (v1 math will add these from JPL Keplerian Elements 1800-2050 AD):
//   raan    — longitude of ascending node Ω (degrees)
//   argp    — argument of perihelion ω (degrees)
//   M0      — mean anomaly at J2000 epoch (degrees)
//   n       — mean motion (degrees / day)
//   a_dot, e_dot, inc_dot, raan_dot, argp_dot, n_dot — linear rates per century
//
// Pluto is NOT in the JPL 8-planet set — separate source (Williams' fit or NSSDC).

export const BODIES = {
  Mercury: { a: 0.387, e: 0.2056, inc: 7.00, lop: 77,  period: 0.241, dia: 4879,   rot: 1407.6,  moons: 0,   axial: 0.03,   color: '#b7a47e',
    fact: 'Smallest planet and closest to the Sun. A single day (sunrise to sunrise) lasts about 176 Earth days — longer than its 88-day year.' },
  Venus:   { a: 0.723, e: 0.0068, inc: 3.39, lop: 131, period: 0.615, dia: 12104,  rot: -5832.5, moons: 0,   axial: 177.4,  color: '#d9b772',
    fact: 'Hottest planet at ~465°C under a runaway greenhouse. It rotates backwards, and its day is longer than its year.' },
  Earth:   { a: 1.000, e: 0.0167, inc: 0.00, lop: 103, period: 1.0,   dia: 12742,  rot: 23.93,   moons: 1,   axial: 23.44,  color: '#4d9be8',
    fact: 'The only known world with life. Its 23.44° axial tilt is what gives us seasons.' },
  Mars:    { a: 1.524, e: 0.0934, inc: 1.85, lop: 336, period: 1.881, dia: 6779,   rot: 24.62,   moons: 2,   axial: 25.19,  color: '#e0633a',
    fact: 'Home to Olympus Mons, the tallest volcano in the solar system at ~22 km. Its two tiny moons are likely captured asteroids.' },
  Jupiter: { a: 5.203, e: 0.0489, inc: 1.30, lop: 14,  period: 11.86, dia: 139820, rot: 9.93,    moons: 95,  axial: 3.13,   color: '#cf9f6e',
    fact: 'The giant — more massive than all other planets combined. The Great Red Spot is a storm wider than Earth that has raged for centuries.' },
  Saturn:  { a: 9.537, e: 0.0565, inc: 2.49, lop: 93,  period: 29.45, dia: 116460, rot: 10.66,   moons: 146, axial: 26.73,  color: '#e3c78a',
    fact: 'Famous for its spectacular ring system of ice and rock. So low in density it would float in water, if you had a big enough tub.' },
  Uranus:  { a: 19.19, e: 0.0457, inc: 0.77, lop: 173, period: 84.0,  dia: 50724,  rot: -17.24,  moons: 28,  axial: 97.77,  color: '#7fe0cf',
    fact: 'Tipped on its side at ~98°, it essentially rolls around the Sun. Each pole gets ~42 years of continuous sunlight, then 42 of darkness.' },
  Neptune: { a: 30.07, e: 0.0113, inc: 1.77, lop: 48,  period: 164.8, dia: 49244,  rot: 16.11,   moons: 16,  axial: 28.32,  color: '#6f9bea',
    fact: 'The windiest planet, with gusts over 2,000 km/h. It was found by math — predicted from Uranus’s wobble before anyone saw it.' },
  Pluto:   { a: 39.48, e: 0.2488, inc: 17.16,lop: 224, period: 248.0, dia: 2376,   rot: -153.3,  moons: 5,   axial: 122.5,  color: '#c2a98f',
    fact: 'Dwarf planet on a 17° tilted, stretched orbit that dips inside Neptune’s — but a 3:2 resonance means they can never collide.' },
};

export const BODY_NAMES = Object.keys(BODIES);
