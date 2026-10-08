// The ~11-year solar cycle, driven by the sim date.
//
// Sunspot number uses Hathaway's cycle-shape function (Hathaway, Wilson &
// Reichmann 1994):  R(t) = a t^3 / (exp(t^2/b^2) - c),  t in months since
// cycle minimum, c = 0.71. b = 53.6 months puts the peak 58 months after
// minimum, matching Cycle 25 (minimum Dec 2019, smoothed peak ~161 in late
// 2024). Overlapping cycles are summed. Minima and amplitudes for recent
// cycles are the observed ones; outside that window cycles repeat every 11
// years at amplitude 150, which is an assumption, not a forecast.
//
// Emergence latitude follows Sporer's law, as fit by Hathaway (2011): the
// centroid of new active regions drifts from ~28 deg at minimum toward the
// equator as  28 deg * exp(-t / 90 months).
//
// Hale's law: leading-spot polarity is opposite in the two hemispheres and
// flips every cycle. `parity` (+1/-1) encodes that.

const C = 0.71;
const B = 53.6;
const PEAK_RAW = 58 ** 3 / (Math.exp((58 * 58) / (B * B)) - C);

const KNOWN = [
  { n: 22, start: 1986.7, amp: 159 },
  { n: 23, start: 1996.4, amp: 180 },
  { n: 24, start: 2008.96, amp: 116 },
  { n: 25, start: 2019.96, amp: 161 },
];
const PERIOD = 11.0;
const DEFAULT_AMP = 150;

function yearOf(ms) {
  return 1970 + ms / (365.25 * 86400000);
}

// Cycle record by index relative to KNOWN[0]; synthesized outside the table.
function cycleRec(i) {
  const first = KNOWN[0];
  const lastI = KNOWN.length - 1;
  if (i >= 0 && i <= lastI) return KNOWN[i];
  if (i < 0) return { n: first.n + i, start: first.start + i * PERIOD, amp: DEFAULT_AMP };
  const k = i - lastI;
  return { n: KNOWN[lastI].n + k, start: KNOWN[lastI].start + k * PERIOD, amp: DEFAULT_AMP };
}

// The current cycle plus its predecessor (which still contributes during the
// overlap near minimum).
function cyclesAround(y) {
  let i = Math.floor((y - KNOWN[0].start) / PERIOD) - 1;
  while (cycleRec(i + 1).start <= y) i++;
  while (cycleRec(i).start > y) i--;
  return [cycleRec(i - 1), cycleRec(i)];
}

function shape(months, amp) {
  if (months <= 0) return 0;
  return (amp / PEAK_RAW) * months ** 3 / (Math.exp((months * months) / (B * B)) - C);
}

export function solarCycleAt(epochMs) {
  const y = yearOf(epochMs);
  const [prev, cur] = cyclesAround(y);
  const ssn = shape((y - prev.start) * 12, prev.amp) + shape((y - cur.start) * 12, cur.amp);
  const months = (y - cur.start) * 12;
  return {
    cycle: cur.n,
    ssn,
    monthsIntoCycle: months,
    meanLatDeg: 28 * Math.exp(-months / 90),
    parity: cur.n % 2 === 0 ? 1 : -1,
    // 0 near minimum, 1 near maximum; used for coronal shape (polar holes,
    // streamer belt) which tracks the cycle.
    activity: Math.min(1, ssn / 150),
  };
}
