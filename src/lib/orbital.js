// Orbital element → heliocentric Cartesian transform.
//
// REPLACES the POC's x-axis tilt approximation. The POC stored only `lop`
// (longitude of perihelion ≈ Ω + ω combined) and rotated the whole orbital
// plane about the world x-axis by `inc`. That's wrong for showing inclined
// orbits in their TRUE relative orientation — most notably Pluto's 17°
// tilt vs Neptune.
//
// Correct transform per standard celestial mechanics:
//   1. Position in orbital plane (perifocal frame, P-Q-W):
//        x_p = r · cos(ν)
//        y_p = r · sin(ν)
//        z_p = 0
//   2. Rotate by -ω about z (align node with x-axis)
//   3. Rotate by -i about x (tilt to ecliptic by inclination)
//   4. Rotate by -Ω about z (rotate ascending node to its ecliptic longitude)
//
// In matrix form for ecliptic-frame Cartesian (x_ecl, y_ecl, z_ecl):
//   x_ecl = (cos(Ω)·cos(ω+ν) - sin(Ω)·sin(ω+ν)·cos(i)) · r
//   y_ecl = (sin(Ω)·cos(ω+ν) + cos(Ω)·sin(ω+ν)·cos(i)) · r
//   z_ecl =  sin(ω+ν) · sin(i)                          · r
//
// Inputs (all angles in radians, r and a in same units):
//   { nu, r, raan, argp, inc }
//
// Returns {x, y, z} in ecliptic-J2000 frame, units matching r.

import { trueAnomaly } from './kepler.js';

export function perifocalToEcliptic({ nu, r, raan, argp, inc }) {
  const u = argp + nu; // argument of latitude
  const cosO = Math.cos(raan), sinO = Math.sin(raan);
  const cosU = Math.cos(u),    sinU = Math.sin(u);
  const cosI = Math.cos(inc),  sinI = Math.sin(inc);
  return {
    x: r * (cosO * cosU - sinO * sinU * cosI),
    y: r * (sinO * cosU + cosO * sinU * cosI),
    z: r * (sinU * sinI),
  };
}

// Full element → position helper. Given Keplerian elements at a date,
// returns heliocentric ecliptic Cartesian position. All angles in radians.
export function keplerianToCartesian({ a, e, M, raan, argp, inc }) {
  const { nu, r } = trueAnomaly(M, e, a);
  return perifocalToEcliptic({ nu, r, raan, argp, inc });
}

export const DEG = Math.PI / 180;
export const RAD = 180 / Math.PI;
