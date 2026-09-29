/**
 * Date presets and how much comparison data a range actually has.
 *
 * "Today" is the dataset's own day after its last complete day — never
 * `Date.now()`, and never a constant from the data config. A demo dataset
 * whose presets follow the wall clock shows an empty dashboard the morning
 * after it is generated.
 */

import { startOfWeek } from '../lib/time/riyadh'
import type { DayRangeQuery } from '../engine/types'

/** The edges of the world, derived from the dataset itself. */
export type DataBounds = {
  /** Absolute Riyadh day index of the first day with data. */
  firstDay: number
  /** Absolute Riyadh day index of the last day with data. */
  lastDay: number
  /**
   * The day the app treats as "today": the day after the last complete day.
   * Data always ends yesterday, so nothing in the UI shows a partial today.
   */
  today: number
}

/** Derive the bounds from anything shaped like a dataset. */
export function boundsOf(dataset: { firstDay: number; days: number }): DataBounds {
  const lastDay = dataset.firstDay + dataset.days - 1
  return { firstDay: dataset.firstDay, lastDay, today: lastDay + 1 }
}

export type PresetId = 'lastWeek' | 'last30Days' | 'quarter' | 'custom'

/** The presets offered as buttons, in the order they are shown. */
export const PRESET_IDS = ['lastWeek', 'last30Days', 'quarter'] as const

/** Keep a range inside the data, and never inverted. */
function clampRange(range: DayRangeQuery, bounds: DataBounds): DayRangeQuery {
  const from = Math.max(range.from, bounds.firstDay)
  const to = Math.min(range.to, bounds.lastDay)
  return from > to ? { from: bounds.firstDay, to: bounds.lastDay } : { from, to }
}

/**
 * The range for a preset, clamped to the data.
 *
 * `lastWeek` is the last *complete* Sunday–Saturday week before today, which
 * is the week a director actually means by "last week" — not the seven days
 * ending yesterday, which cuts across two weekends.
 */
export function presetRange(
  preset: Exclude<PresetId, 'custom'>,
  bounds: DataBounds,
): DayRangeQuery {
  const yesterday = bounds.today - 1

  switch (preset) {
    case 'lastWeek': {
      // Sunday of the week containing today, then step back one whole week.
      const from = startOfWeek(bounds.today) - 7
      return clampRange({ from, to: from + 6 }, bounds)
    }
    case 'last30Days':
      return clampRange({ from: yesterday - 29, to: yesterday }, bounds)
    case 'quarter':
      return { from: bounds.firstDay, to: bounds.lastDay }
  }
}

/** The range shown when nothing is in the URL. */
export function defaultRange(bounds: DataBounds): DayRangeQuery {
  return presetRange('lastWeek', bounds)
}

/**
 * Which preset a range corresponds to, or `'custom'`.
 *
 * Presets are tested in {@link PRESET_IDS} order and the first match wins.
 * That matters when two coincide: if today is a Sunday, "last week" and "the
 * last 7 days" are the same seven days, and the button that lights up is
 * `lastWeek`, which is the one a person would have meant.
 */
export function activePreset(range: DayRangeQuery, bounds: DataBounds): PresetId {
  for (const preset of PRESET_IDS) {
    const candidate = presetRange(preset, bounds)
    if (candidate.from === range.from && candidate.to === range.to) return preset
  }
  return 'custom'
}

/** How much of the comparison period the dataset can actually cover. */
export type ComparisonCoverage = 'full' | 'partial' | 'none'

/**
 * Whether the comparison period fits inside the data.
 *
 * This is the difference between an honest dashboard and a lying one. The
 * quarter preset spans every day there is, so its comparison period is
 * entirely before the data starts — comparing against it would read as
 * "−100%", which is not a collapse in service quality, it is the absence of
 * history.
 */
export function comparisonCoverage(range: DayRangeQuery, bounds: DataBounds): ComparisonCoverage {
  const previous = comparisonRange(range)
  const overlapFrom = Math.max(previous.from, bounds.firstDay)
  const overlapTo = Math.min(previous.to, bounds.lastDay)
  const overlapDays = Math.max(0, overlapTo - overlapFrom + 1)

  if (overlapDays === 0) return 'none'

  const previousDays = previous.to - previous.from + 1
  return overlapDays < previousDays ? 'partial' : 'full'
}

/** Days in an inclusive range. */
export function rangeLengthOf(range: DayRangeQuery): number {
  return range.to - range.from + 1
}

/**
 * How far back the comparison period sits, in days: always a whole number of
 * weeks, and always at least as long as the range itself.
 */
export function comparisonShift(range: DayRangeQuery): number {
  return Math.ceil(rangeLengthOf(range) / 7) * 7
}

/**
 * The period to compare against: the same length, shifted back a whole number
 * of weeks.
 *
 * **Not** simply "the days immediately before". That is the obvious answer and
 * it is wrong here, because this business has a weekly rhythm — Friday runs at
 * 45% of a workday and Saturday at 65%. Comparing 17–26 September (2 Fridays)
 * with the 10 days before it (1 Friday) reports a volume drop that is purely
 * an artefact of which weekend days each window happened to contain. That bug
 * was visible in manual testing as a "notable" change with no cause.
 *
 * Shifting by `ceil(length / 7) * 7` guarantees both windows contain the same
 * multiset of weekdays, so any difference left is about the calls. The cost is
 * that a 10-day range compares against 14 days earlier rather than 10 — a gap
 * the UI names out loud rather than hiding.
 */
export function comparisonRange(range: DayRangeQuery): DayRangeQuery {
  const shift = comparisonShift(range)
  return { from: range.from - shift, to: range.to - shift }
}

/**
 * True when the comparison period is further back than the range is long, so
 * the label has to explain the gap rather than say "the previous period".
 */
export function comparisonIsShifted(range: DayRangeQuery): boolean {
  return comparisonShift(range) !== rangeLengthOf(range)
}

/** How many whole weeks back the comparison sits. Used for the label. */
export function comparisonWeeksBack(range: DayRangeQuery): number {
  return comparisonShift(range) / 7
}
