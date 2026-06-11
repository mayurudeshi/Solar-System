// Verified physical & display data per NASA NSSDC Planetary Fact Sheet:
//   https://nssdc.gsfc.nasa.gov/planetary/factsheet/
//
// J2000 Keplerian elements + per-century linear rates for planets Mercury
// through Neptune are from JPL "Keplerian Elements for Approximate Positions
// of the Major Planets (1800 AD - 2050 AD)":
//   https://ssd.jpl.nasa.gov/planets/approx_pos.html
//
// Pluto is NOT in the JPL planets set. Its J2000 elements + rates use the
// NASA NSSDC mean orbital elements:
//   https://nssdc.gsfc.nasa.gov/planetary/factsheet/plutofact.html
//   (a, e, I, L, ϖ, Ω at J2000 plus century rates from osculating mean fit)
//
// ── Element legend ──
//   a         semi-major axis (AU)
//   e         eccentricity
//   I         orbital inclination to ecliptic (degrees)
//   L         mean longitude (degrees) — angular position of an imaginary
//             body moving uniformly with the same period; mean anomaly is
//             derived: M = L - ϖ.
//   long_peri longitude of perihelion ϖ = Ω + ω (degrees)
//   raan      longitude of ascending node Ω (degrees)
//   ω         argument of perihelion is derived: ω = ϖ - Ω.
//   *_dot     linear rate per Julian century (deg/century or AU/century).
//
// At any date t, T = centuries since J2000:
//   a(t) = a + a_dot · T,  same for e, I, L, ϖ, Ω.
// Then M = L(t) - ϖ(t), solve Kepler's equation for E, get true anomaly ν,
// rotate by (Ω, I, ω) into ecliptic-J2000 Cartesian.

export const BODIES = {
  Mercury: {
    a: 0.387, e: 0.2056, inc: 7.00, lop: 77, period: 0.241,
    dia: 4879, rot: 1407.6, moons: 0, axial: 0.03, color: '#b7a47e',
    fact: 'Smallest planet and closest to the Sun. A single day (sunrise to sunrise) lasts about 176 Earth days — longer than its 88-day year.',
    elements: {
      a: 0.38709843,      a_dot: 0.00000000,
      e: 0.20563661,      e_dot: 0.00002123,
      I: 7.00559432,      I_dot: -0.00590158,
      L: 252.25166724,    L_dot: 149472.67486623,
      long_peri: 77.45771895, long_peri_dot: 0.15940013,
      raan: 48.33961819,  raan_dot: -0.12214182,
    },
  },
  Venus: {
    a: 0.723, e: 0.0068, inc: 3.39, lop: 131, period: 0.615,
    dia: 12104, rot: -5832.5, moons: 0, axial: 177.4, color: '#d9b772',
    fact: 'Hottest planet at ~465°C under a runaway greenhouse. It rotates backwards, and its day is longer than its year.',
    elements: {
      a: 0.72332102,      a_dot: -0.00000026,
      e: 0.00676399,      e_dot: -0.00005107,
      I: 3.39777545,      I_dot: 0.00043494,
      L: 181.97970850,    L_dot: 58517.81560260,
      long_peri: 131.76755713, long_peri_dot: 0.05679648,
      raan: 76.67261496,  raan_dot: -0.27274174,
    },
  },
  Earth: {
    a: 1.000, e: 0.0167, inc: 0.00, lop: 103, period: 1.0,
    dia: 12742, rot: 23.93, moons: 1, axial: 23.44, color: '#4d9be8',
    fact: 'The only known world with life. Its 23.44° axial tilt is what gives us seasons.',
    elements: {
      a: 1.00000018,      a_dot: -0.00000003,
      e: 0.01673163,      e_dot: -0.00003661,
      I: -0.00054346,     I_dot: -0.01337178,
      L: 100.46691572,    L_dot: 35999.37306329,
      long_peri: 102.93005885, long_peri_dot: 0.31795260,
      raan: -5.11260389,  raan_dot: -0.24123856,
    },
  },
  Mars: {
    a: 1.524, e: 0.0934, inc: 1.85, lop: 336, period: 1.881,
    dia: 6779, rot: 24.62, moons: 2, axial: 25.19, color: '#e0633a',
    fact: 'Home to Olympus Mons, the tallest volcano in the solar system at ~22 km. Its two tiny moons are likely captured asteroids.',
    elements: {
      a: 1.52371243,      a_dot: 0.00000097,
      e: 0.09336511,      e_dot: 0.00009149,
      I: 1.85181869,      I_dot: -0.00724757,
      L: -4.56813164,     L_dot: 19140.29934243,
      long_peri: -23.91744784, long_peri_dot: 0.45223625,
      raan: 49.71320984,  raan_dot: -0.26852431,
    },
  },
  Jupiter: {
    a: 5.203, e: 0.0489, inc: 1.30, lop: 14, period: 11.86,
    dia: 139820, rot: 9.93, moons: 95, axial: 3.13, color: '#cf9f6e',
    fact: 'The giant — more massive than all other planets combined. The Great Red Spot is a storm wider than Earth that has raged for centuries.',
    elements: {
      a: 5.20248019,      a_dot: -0.00002864,
      e: 0.04853590,      e_dot: 0.00018026,
      I: 1.29861416,      I_dot: -0.00322699,
      L: 34.33479152,     L_dot: 3034.90371757,
      long_peri: 14.27495244,  long_peri_dot: 0.18199196,
      raan: 100.29282654, raan_dot: 0.13024619,
    },
  },
  Saturn: {
    a: 9.537, e: 0.0565, inc: 2.49, lop: 93, period: 29.45,
    dia: 116460, rot: 10.66, moons: 146, axial: 26.73, color: '#e3c78a',
    fact: 'Famous for its spectacular ring system of ice and rock. So low in density it would float in water, if you had a big enough tub.',
    elements: {
      a: 9.54149883,      a_dot: -0.00003065,
      e: 0.05550825,      e_dot: -0.00032044,
      I: 2.49424102,      I_dot: 0.00451969,
      L: 50.07571329,     L_dot: 1222.11494724,
      long_peri: 92.86136063,  long_peri_dot: 0.54179478,
      raan: 113.63998702, raan_dot: -0.25015002,
    },
  },
  Uranus: {
    a: 19.19, e: 0.0457, inc: 0.77, lop: 173, period: 84.0,
    dia: 50724, rot: -17.24, moons: 28, axial: 97.77, color: '#7fe0cf',
    fact: 'Tipped on its side at ~98°, it essentially rolls around the Sun. Each pole gets ~42 years of continuous sunlight, then 42 of darkness.',
    elements: {
      a: 19.18797948,     a_dot: -0.00020455,
      e: 0.04685740,      e_dot: -0.00001550,
      I: 0.77298127,      I_dot: -0.00180155,
      L: 314.20276625,    L_dot: 428.49512595,
      long_peri: 172.43404441, long_peri_dot: 0.09266985,
      raan: 73.96250215,  raan_dot: 0.05739699,
    },
  },
  Neptune: {
    a: 30.07, e: 0.0113, inc: 1.77, lop: 48, period: 164.8,
    dia: 49244, rot: 16.11, moons: 16, axial: 28.32, color: '#6f9bea',
    fact: 'The windiest planet, with gusts over 2,000 km/h. It was found by math — predicted from Uranus’s wobble before anyone saw it.',
    elements: {
      a: 30.06952752,     a_dot: 0.00006447,
      e: 0.00895439,      e_dot: 0.00000818,
      I: 1.77005520,      I_dot: 0.00022400,
      L: 304.22289198,    L_dot: 218.46515314,
      long_peri: 46.68158724,  long_peri_dot: 0.01009938,
      raan: 131.78635853, raan_dot: -0.00606302,
    },
  },
  // Pluto — NSSDC mean elements (not in the JPL 8-planet set).
  Pluto: {
    a: 39.48, e: 0.2488, inc: 17.16, lop: 224, period: 248.0,
    dia: 2376, rot: -153.3, moons: 5, axial: 122.5, color: '#c2a98f',
    fact: 'Dwarf planet on a 17° tilted, stretched orbit that dips inside Neptune’s — but a 3:2 resonance means they can never collide.',
    elements: {
      a: 39.48168677,     a_dot: -0.00076912,
      e: 0.24880766,      e_dot: 0.00006465,
      I: 17.14175,        I_dot: 0.00004818,
      L: 238.92903833,    L_dot: 145.20780515,
      long_peri: 224.06891629, long_peri_dot: -0.04062942,
      raan: 110.30393684, raan_dot: -0.01183482,
    },
  },
};

export const BODY_NAMES = Object.keys(BODIES);
