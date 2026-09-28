/**
 * Turning the daily counts into something a chart can draw honestly.
 *
 * The load-bearing decision is in the type: `resolutionRate` is
 * `number | undefined`, never `0`. With a narrow filter — one agent, one
 * intent, one language — plenty of days have no calls at all, and plotting
 * those as 0% draws a cliff to the floor that looks exactly like a total
 * service failure. A day with no calls has no rate. The line breaks instead.
 *
 * The summary is computed here too, from the data alone. It never reads STORY:
 * the planted anomalies have to be *found* by this code the way the director
 * would find them, or the dashboard proves nothing.
 */

import type { Counts } from '../engine/types'

/** Below this many calls a daily rate is mostly sampling noise. */
export const LOW_VOLUME_THRESHOLD = 20

export type DailyPoint = {
  /** Absolute Riyadh day index. */
  dayIndex: number
  calls: number
  /** Undefined when there were no calls — not zero. */
  resolutionRate: number | undefined
  /** Calls with at least one tool error, over all calls. Undefined at zero. */
  toolErrorRate: number | undefined
  /** True when the day has calls but too few for its rate to mean much. */
  lowVolume: boolean
}

/**
 * Pair each daily tally with its day index and derive the two rates.
 * `daily` is indexed from `firstDay`, one entry per day of the dataset.
 */
export function prepareDaily(daily: readonly Counts[], firstDay: number): DailyPoint[] {
  return daily.map((counts, offset) => {
    const hasCalls = counts.calls > 0

    return {
      dayIndex: firstDay + offset,
      calls: counts.calls,
      resolutionRate: hasCalls ? counts.resolved / counts.calls : undefined,
      toolErrorRate: hasCalls ? counts.toolErrorCalls / counts.calls : undefined,
      lowVolume: hasCalls && counts.calls < LOW_VOLUME_THRESHOLD,
    }
  })
}

export type DayExtreme = {
  dayIndex: number
  rate: number
}

export type TrendSummary = {
  /** Call-weighted mean resolution across every day with calls. */
  quarterAverage: number | undefined
  /** Same, restricted to the selected range. */
  selectedAverage: number | undefined
  /** The worst resolution day, ignoring days with no calls. */
  lowestResolution: DayExtreme | null
  /** The worst tool-error day. */
  highestToolError: DayExtreme | null
  /** True when any day with calls falls under the low-volume threshold. */
  noisy: boolean
  /** True when nothing matched the filters at all. */
  empty: boolean
}

/** Call-weighted rather than a mean of daily rates — a 12-call Friday must not
 * count as much as a 2,700-call Tuesday. */
function weightedRate(points: readonly DailyPoint[], pick: (p: DailyPoint) => number | undefined) {
  let numerator = 0
  let denominator = 0

  for (const point of points) {
    const rate = pick(point)
    if (rate === undefined) continue
    numerator += rate * point.calls
    denominator += point.calls
  }
  return denominator > 0 ? numerator / denominator : undefined
}

/**
 * Everything the summary sentence needs, as numbers.
 *
 * Kept separate from the sentence itself so the arithmetic can be tested
 * without a renderer and without a language.
 */
export function summarizeTrend(
  points: readonly DailyPoint[],
  selected: { from: number; to: number },
): TrendSummary {
  const withCalls = points.filter((point) => point.calls > 0)
  const inSelection = points.filter(
    (point) => point.dayIndex >= selected.from && point.dayIndex <= selected.to,
  )

  let lowestResolution: DayExtreme | null = null
  let highestToolError: DayExtreme | null = null

  for (const point of withCalls) {
    // Days with no calls are skipped entirely: they are not the worst day,
    // they are an absence of days.
    if (point.resolutionRate !== undefined) {
      if (lowestResolution === null || point.resolutionRate < lowestResolution.rate) {
        lowestResolution = { dayIndex: point.dayIndex, rate: point.resolutionRate }
      }
    }
    if (point.toolErrorRate !== undefined) {
      if (highestToolError === null || point.toolErrorRate > highestToolError.rate) {
        highestToolError = { dayIndex: point.dayIndex, rate: point.toolErrorRate }
      }
    }
  }

  return {
    quarterAverage: weightedRate(points, (p) => p.resolutionRate),
    selectedAverage: weightedRate(inSelection, (p) => p.resolutionRate),
    lowestResolution,
    highestToolError,
    noisy: withCalls.some((point) => point.lowVolume),
    empty: withCalls.length === 0,
  }
}

/** A "nice" upper bound for the tool-error axis: never below 5%, rounded up. */
export function niceRateMax(
  points: readonly DailyPoint[],
  pick: (p: DailyPoint) => number | undefined,
): number {
  let max = 0
  for (const point of points) {
    const rate = pick(point)
    if (rate !== undefined && rate > max) max = rate
  }
  // Round up to the next 5 points so the axis has round labels, with a floor
  // so a quiet quarter does not get a wildly magnified axis.
  const stepped = Math.ceil((max + 0.001) / 0.05) * 0.05
  return Math.min(1, Math.max(0.05, stepped))
}
