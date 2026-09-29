/**
 * How big a change has to be before it is worth a director's attention.
 *
 * These are **materiality** thresholds, and they answer a different question
 * from the z-test in `stats.ts`. The z-test asks "is this real?"; these ask
 * "is it big enough to do anything about?". A change needs both, and the
 * dashboard was previously only asking the first.
 *
 * What that looked like in review: on the whole quarter, 12 of 25 intents
 * carried an "Improving" badge. Every one was statistically real — 90 days of
 * calls will resolve a one-point shift — and collectively they buried the one
 * intent that actually needed action. Worse, +1.9 points was flagged on one
 * intent and not on another, which is correct (noise scales with volume and
 * with distance from a 50% rate) but reads as arbitrary unless the reader is
 * told the rule.
 *
 * The numbers below are deliberately round. They are judgement calls about
 * what a contact-centre director would act on, not estimates of anything, and
 * a false precision like 2.7 points would imply a derivation that does not
 * exist.
 */

/**
 * Minimum movement in a whole-centre KPI, in percentage points.
 *
 * At roughly 15,000 calls a week, one point is about 150 calls — a full
 * day's work for an agent, and the smallest shift worth a line in a weekly
 * report. Below that the number moves for reasons nobody can name.
 */
export const KPI_MIN_POINTS = 1

/**
 * Minimum movement in a single intent, agent or failure reason, in points.
 *
 * Three rather than one because a segment is a smaller, noisier slice and
 * because there are dozens of them on screen at once. A threshold that flags
 * one row in forty is useful; one that flags half of them is wallpaper, and
 * the reader stops reading badges altogether.
 */
export const SEGMENT_MIN_POINTS = 3

/**
 * Minimum relative change in a call count, as a ratio.
 *
 * Volume is the burstiest thing in the dataset — a campaign, an outage or a
 * billing run moves it several percent without anything being wrong. Five per
 * cent is the point at which a capacity conversation starts.
 */
export const COUNT_MIN_RATIO = 0.05

/** Points are stored as ratios everywhere; this converts a threshold to one. */
export function pointsToRatio(points: number): number {
  return points / 100
}
