// Kepler's equation solver and orbital position math.
//
// All angles are radians internally. Bodies-table fields are degrees;
// caller is responsible for the deg→rad conversion at the boundary.

const TWO_PI = Math.PI * 2;

// Solve Kepler's equation M = E - e·sin(E) for eccentric anomaly E.
// Newton-Raphson iteration. 7 iterations is overkill for e<0.3 (planet range)
// but cheap, and gives Pluto convergence to ~1e-12 rad.
export function solveKepler(M, e, iterations = 7) {
  // Normalize M to [-π, π) for faster convergence on highly eccentric orbits
  let m = ((M % TWO_PI) + TWO_PI) % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  let E = m + e * Math.sin(m); // initial guess

  for (let k = 0; k < iterations; k++) {
    const f  = E - e * Math.sin(E) - m;
    const fp = 1 - e * Math.cos(E);
    E -= f / fp;
  }
  return E;
}

// Given mean anomaly M (rad), eccentricity e, semi-major axis a (any units),
// returns { nu, r } — true anomaly (rad) and radius (same units as a).
export function trueAnomaly(M, e, a) {
  const E = solveKepler(M, e);
  const nu = 2 * Math.atan2(
    Math.sqrt(1 + e) * Math.sin(E / 2),
    Math.sqrt(1 - e) * Math.cos(E / 2)
  );
  const r = a * (1 - e * Math.cos(E));
  return { nu, r, E };
}
