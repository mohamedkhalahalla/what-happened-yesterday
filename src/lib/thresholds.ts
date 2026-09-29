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

// --- detectors --------------------------------------------------------------

/*
 * The constants below decide what the dashboard says out loud without being
 * asked. That is a higher bar than a badge: a badge is an annotation on a
 * number the reader chose to look at, while a detected insight claims the top
 * of the page and asserts that this is what to fix first. Every one of these
 * is set so that the anomaly-free dataset produces **nothing at all** — see
 * the precision test in `src/insights/detect.test.ts`.
 */

/**
 * An agent's transfer rate must be at least this multiple of the median of
 * the agents in view before it is called out.
 *
 * The same 1.5 the Agent comparison widget badges at, deliberately: two
 * different answers to "is this agent an outlier?" on one screen is a bug
 * the reader has to resolve, and they have no way to.
 */
export const AGENT_OUTLIER_RATIO = 1.5

/**
 * Below this many agents, "the median agent" is not a comparison worth making.
 *
 * With two agents the median is their midpoint, so the busier one is always
 * above it and the ratio test reduces to "one of you is worse than the other",
 * which is true of any two people and tells a director nothing.
 */
export const MIN_AGENTS_FOR_OUTLIER = 3

/**
 * Robust z at which a single day is called an incident.
 *
 * Four, not the two that marks a change as notable elsewhere. A notable change
 * says "look at this when you have a moment"; an incident says "something
 * broke on Tuesday". The median-and-MAD it is measured against is already
 * resistant to the outlier being measured, so a day that clears four is
 * genuinely unlike the same weekday in every other week of the quarter.
 */
export const INCIDENT_ROBUST_Z = 4

/**
 * A day below this many calls is not eligible to be an incident.
 *
 * Daily rates on a few dozen calls swing by tens of points on their own, and
 * a robust z built from a MAD of quiet days will happily certify that noise
 * at z = 9. This is the floor at which the day's rate means anything.
 */
export const INCIDENT_MIN_DAY_CALLS = 200

/**
 * How far above its baseline a day's tool-error rate must also be, in points.
 *
 * The z-test says the day is unlike its neighbours; this says the difference
 * is big enough to have broken something. Five points on a base of six is
 * roughly a doubling.
 */
export const INCIDENT_TOOL_ERROR_MIN_POINTS = 5

/**
 * How far below baseline a day's resolution rate must also be, in points.
 *
 * Lower than the tool-error threshold because resolution is the outcome the
 * business is actually made of: three points of it on a normal day is around
 * seventy customers who did not get an answer.
 */
export const INCIDENT_RESOLUTION_MIN_POINTS = 3

/**
 * Same-weekday days needed before a baseline is trusted.
 *
 * A median of two numbers is their average, and a MAD of two is half their
 * gap — neither describes "a normal Tuesday". Four other Tuesdays is the
 * point at which one bad one cannot drag the baseline to meet it.
 *
 * On a ninety-day quarter every day has twelve, so this never binds: it is a
 * guard against being handed a much shorter dataset, not a statement about
 * where in the quarter a day sits. It used to be both, and that was the bug —
 * days near the ends of the data went unjudged, including yesterday.
 */
export const INCIDENT_MIN_BASELINE_DAYS = 4

/**
 * How many of each group the Fix-first widget shows before "Show all".
 *
 * A list of twenty things to fix first is a list of nothing to fix first. Five
 * is about what fits on screen next to the evidence for each, and three
 * incidents is more history than a weekly meeting can act on.
 */
export const MAX_ONGOING_SHOWN = 5
export const MAX_INCIDENTS_SHOWN = 3

/** Points are stored as ratios everywhere; this converts a threshold to one. */
export function pointsToRatio(points: number): number {
  return points / 100
}
