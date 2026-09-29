/**
 * Ranking intents by what is actually worth fixing.
 *
 * The default sort is **unresolved calls**, not resolution rate. A rate sorts
 * `store_locator` at 88% to the bottom and a 20-call intent failing at 40% to
 * the top, neither of which is where the work is. Unresolved calls is the
 * quantity a team can actually reduce: it is rate and volume multiplied, which
 * is what "what should we fix first?" means.
 *
 * The 13-week sparkline and the quarter trend exist because a rate for the
 * selected week cannot show rot. An intent that has been sliding since June
 * looks unremarkable in any one week; it only shows up against its own
 * history.
 */

import type { Aggregates, Counts } from '../engine/types'
import { compareRates, type Comparison } from '../lib/stats'

/** Below this many calls in a week, a weekly rate is noise — drawn as a gap. */
export const MIN_WEEK_CALLS = 20

/** Below this many calls in the range, the rate is shown muted. */
export const MIN_ROW_CALLS = 30

/** How many weeks at each end the quarter trend compares. */
export const QUARTER_TREND_WEEKS = 4

export type QuarterTrend = {
  /** Last window minus first window, as a ratio difference. */
  delta: number
  comparison: Comparison
  /** True when the decline is both downward and bigger than noise. */
  declining: boolean
  /** The first window's totals — what it used to be. */
  early: Counts
  /** The last window's totals — what it is now. */
  recent: Counts
  /**
   * True when the rise is both upward and material.
   *
   * Deliberately **not** badged in the UI. Badging improvements is what put
   * twelve badges on screen at once and buried the single row that needed
   * action; an improving intent needs no call to action, so it gets its arrow
   * and its number and nothing more. Kept because it is a real fact about the
   * row that a future summary line may want.
   */
  improving: boolean
}

export type IntentRow = {
  code: number
  calls: number
  resolved: number
  /** Transferred or abandoned: every call the agent did not finish. */
  unresolved: number
  /** Undefined when the intent had no calls in the range. */
  resolutionRate: number | undefined
  /** Change against the comparison period. */
  delta: Comparison
  /** Weekly resolution rate; `undefined` for weeks below {@link MIN_WEEK_CALLS}. */
  weekly: (number | undefined)[]
  quarterTrend: QuarterTrend | null
  /** True when the range holds too few calls for the rate to mean much. */
  fewCalls: boolean
}

/**
 * Which weekly buckets are whole weeks inside the dataset.
 *
 * The first bucket starts on the Sunday on or before the first data day, so it
 * is usually partial, and the last one usually runs past the last data day.
 * Comparing a 3-day stub against a full week would invent a trend.
 */
export function fullWeekBounds(
  weekStarts: readonly number[],
  firstDay: number,
  lastDay: number,
): { from: number; to: number } {
  const first = weekStarts[0] === firstDay ? 0 : 1
  const lastIndex = weekStarts.length - 1
  const lastStart = weekStarts[lastIndex]
  const last = lastStart !== undefined && lastStart + 6 <= lastDay ? lastIndex : lastIndex - 1
  return { from: first, to: last }
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

/** Sum a slice of weekly counts. */
function totalOf(weekly: readonly Counts[], from: number, to: number): Counts {
  const total = {
    calls: 0,
    resolved: 0,
    transferred: 0,
    abandoned: 0,
    toolErrorCalls: 0,
    toolErrorsSum: 0,
  }
  for (let i = from; i <= to; i++) {
    const week = weekly[i]
    if (week === undefined) continue
    total.calls += week.calls
    total.resolved += week.resolved
    total.transferred += week.transferred
    total.abandoned += week.abandoned
    total.toolErrorCalls += week.toolErrorCalls
    total.toolErrorsSum += week.toolErrorsSum
  }
  return total
}

/**
 * Resolution in the last four full weeks against the first four.
 *
 * Deliberately end-to-end rather than a fitted slope: a slope needs a model of
 * the noise to be worth reading, and this only has to answer "is it materially
 * worse now than it was then", which a z-test on two windows answers directly.
 */
export function quarterTrend(
  weekly: readonly Counts[],
  bounds: { from: number; to: number },
): QuarterTrend | null {
  const available = bounds.to - bounds.from + 1
  // Fewer than two non-overlapping windows: there is no "then" to compare to.
  if (available < QUARTER_TREND_WEEKS * 2) return null

  const first = totalOf(weekly, bounds.from, bounds.from + QUARTER_TREND_WEEKS - 1)
  const last = totalOf(weekly, bounds.to - QUARTER_TREND_WEEKS + 1, bounds.to)

  const comparison = compareRates(last.resolved, last.calls, first.resolved, first.calls)
  const notable = comparison.verdict === 'notable'

  return {
    delta: comparison.delta,
    comparison,
    // Exposed so a caller can say how much the decline costs a week without
    // recomputing the windows and risking a different answer from the badge.
    early: first,
    recent: last,
    declining: notable && comparison.delta < 0,
    improving: notable && comparison.delta > 0,
  }
}

export type BuildIntentRowsOptions = {
  weekStarts: readonly number[]
  firstDay: number
  lastDay: number
}

/** One row per intent that had calls in the range, unsorted. */
export function buildIntentRows(
  aggregates: Aggregates,
  options: BuildIntentRowsOptions,
): IntentRow[] {
  const weekBounds = fullWeekBounds(options.weekStarts, options.firstDay, options.lastDay)

  return aggregates.intents.map((intent, code) => {
    const { current, previous, weekly } = intent
    const unresolved = current.transferred + current.abandoned

    return {
      code,
      calls: current.calls,
      resolved: current.resolved,
      unresolved,
      resolutionRate: current.calls > 0 ? ratio(current.resolved, current.calls) : undefined,
      delta: compareRates(current.resolved, current.calls, previous.resolved, previous.calls),
      weekly: weekly.map((week) =>
        // A week below the threshold is drawn as a gap, not as its rate: two
        // calls out of three is not "67%", it is noise.
        week.calls >= MIN_WEEK_CALLS ? ratio(week.resolved, week.calls) : undefined,
      ),
      quarterTrend: quarterTrend(weekly, weekBounds),
      fewCalls: current.calls > 0 && current.calls < MIN_ROW_CALLS,
    }
  })
}

export type IntentSortKey = 'intent' | 'calls' | 'resolution' | 'delta' | 'unresolved' | 'quarter'

export type SortDirection = 'asc' | 'desc'

/**
 * Sort rows by a column.
 *
 * `labelOf` is passed in rather than imported so this stays pure and
 * language-agnostic — sorting by intent name has to follow the UI language.
 */
export function sortIntentRows(
  rows: readonly IntentRow[],
  key: IntentSortKey,
  direction: SortDirection,
  labelOf: (code: number) => string,
): IntentRow[] {
  const sign = direction === 'asc' ? 1 : -1

  const value = (row: IntentRow): number => {
    switch (key) {
      case 'calls':
        return row.calls
      case 'resolution':
        // Rows with no calls sort last whichever way the column is pointing.
        return row.resolutionRate ?? -1
      case 'delta':
        return row.delta.delta
      case 'unresolved':
        return row.unresolved
      case 'quarter':
        return row.quarterTrend?.delta ?? 0
      case 'intent':
        return 0
    }
  }

  return [...rows].sort((a, b) => {
    if (key === 'intent') return sign * labelOf(a.code).localeCompare(labelOf(b.code))
    const difference = value(a) - value(b)
    // Ties broken by unresolved calls, so the order is stable and meaningful.
    return sign * difference || b.unresolved - a.unresolved
  })
}
