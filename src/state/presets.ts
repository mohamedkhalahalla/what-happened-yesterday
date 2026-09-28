/**
 * Date presets and how much comparison data a range actually has.
 *
 * "Today" is the dataset's own day after its last complete day — never
 * `Date.now()`, and never a constant from the data config. A demo dataset
 * whose presets follow the wall clock shows an empty dashboard the morning
 * after it is generated.
 */

import { previousPeriod, startOfWeek } from '../lib/time/riyadh'
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
 * Whether the previous period fits inside the data.
 *
 * This is the difference between an honest dashboard and a lying one. The
 * quarter preset spans every day there is, so its previous period is entirely
 * before the data starts — comparing against it would read as "−100%", which
 * is not a collapse in service quality, it is the absence of history.
 */
export function comparisonCoverage(range: DayRangeQuery, bounds: DataBounds): ComparisonCoverage {
  const previous = previousPeriod(range)
  const overlapFrom = Math.max(previous.from, bounds.firstDay)
  const overlapTo = Math.min(previous.to, bounds.lastDay)
  const overlapDays = Math.max(0, overlapTo - overlapFrom + 1)

  if (overlapDays === 0) return 'none'

  const previousDays = previous.to - previous.from + 1
  return overlapDays < previousDays ? 'partial' : 'full'
}

/** The comparison period itself, for labelling. Not clamped — the UI says so. */
export function comparisonRange(range: DayRangeQuery): DayRangeQuery {
  return previousPeriod(range)
}
