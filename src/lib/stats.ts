/**
 * Is this change worth looking at, or is it just noise?
 *
 * A dashboard that shows "resolution down 0.5 points" with a red arrow every
 * Monday trains its reader to ignore arrows. These two tests exist so the UI
 * can say "within normal variation" in words, and reserve attention for the
 * changes that survive a sanity check.
 *
 * ## The honest caveat
 *
 * Both tests assume calls are independent Bernoulli or Poisson draws. Real
 * contact-centre data is **overdispersed**: calls arrive in correlated bursts
 * (an outage, a billing run, a campaign), agents have good and bad days, and
 * intents are not independent of the hour. Real variance is therefore *higher*
 * than these formulas assume.
 *
 * So the z-scores here are a **lower bound on normal variation**, not a
 * guarantee. "Within normal variation" is trustworthy — if this test cannot
 * see a difference, there almost certainly is not one. "Notable" is weaker: it
 * means "larger than pure sampling noise", not "real and caused by something".
 * That asymmetry is deliberate, because the expensive mistake for a director
 * is chasing noise, not missing a marginal signal for one more day.
 *
 * No p-values are shown anywhere. |z| ≥ 2 is roughly p < 0.05 two-tailed, and
 * a director does not need the number to decide whether to open the drill-down.
 */

/** How to read a comparison. */
export type Verdict =
  /** Bigger than sampling noise alone would explain. Worth a look. */
  | 'notable'
  /** Indistinguishable from noise at this volume. */
  | 'normal'
  /** Too little data to say anything either way. */
  | 'insufficient'

/** Below this many observations, the normal approximation is not trustworthy. */
const MIN_SAMPLE = 30

/** |z| at or above this counts as notable (≈ p < 0.05, two-tailed). */
const NOTABLE_Z = 2

export type Comparison = {
  /** Current minus previous. For rates this is a ratio difference, not points. */
  delta: number
  /** Standard error of that difference under the null hypothesis. */
  se: number
  /** Standardised difference. Zero when it cannot be computed. */
  z: number
  verdict: Verdict
}

/** A rate that is 0/0 is not 0 — it is unknown. Callers get 0 and a verdict. */
function safeRate(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

/**
 * Two-proportion z-test with the pooled proportion.
 *
 * @param k1 successes in the current period (e.g. resolved calls)
 * @param n1 trials in the current period (e.g. all calls)
 * @param k2 successes in the previous period
 * @param n2 trials in the previous period
 *
 * Pooled rather than unpooled because the null hypothesis is "these came from
 * the same underlying rate", and under that hypothesis the best estimate of
 * that rate uses both samples.
 */
export function compareRates(k1: number, n1: number, k2: number, n2: number): Comparison {
  const p1 = safeRate(k1, n1)
  const p2 = safeRate(k2, n2)
  const delta = p1 - p2

  // Either period too small: report the difference, refuse to judge it.
  if (n1 < MIN_SAMPLE || n2 < MIN_SAMPLE) {
    return { delta, se: 0, z: 0, verdict: 'insufficient' }
  }

  const pooled = (k1 + k2) / (n1 + n2)
  const se = Math.sqrt(pooled * (1 - pooled) * (1 / n1 + 1 / n2))

  // se is zero when the pooled rate is exactly 0 or 1 — every call resolved,
  // or none did, in both periods. There is no observed variation to divide by,
  // and dividing would give Infinity or NaN.
  if (!(se > 0)) {
    return { delta, se: 0, z: 0, verdict: 'normal' }
  }

  const z = delta / se
  return { delta, se, z, verdict: Math.abs(z) >= NOTABLE_Z ? 'notable' : 'normal' }
}

/**
 * Poisson approximation for comparing two counts.
 *
 * Under a Poisson model the variance of a count equals its mean, so the
 * variance of a difference of two independent counts is estimated by their
 * sum — hence `z = (c1 - c2) / sqrt(c1 + c2)`.
 *
 * This is where the overdispersion caveat bites hardest: call volume is the
 * most bursty thing in the dataset, so treat a "notable" volume change as a
 * prompt to look, never as a finding.
 */
export function compareCounts(c1: number, c2: number): Comparison {
  const delta = c1 - c2
  const total = c1 + c2

  if (total < MIN_SAMPLE) {
    return { delta, se: 0, z: 0, verdict: 'insufficient' }
  }

  const se = Math.sqrt(total)
  if (!(se > 0)) {
    return { delta, se: 0, z: 0, verdict: 'normal' }
  }

  const z = delta / se
  return { delta, se, z, verdict: Math.abs(z) >= NOTABLE_Z ? 'notable' : 'normal' }
}
