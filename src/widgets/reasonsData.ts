/**
 * Why calls failed, as a rate rather than a count.
 *
 * Everything here is **per 100 calls**. Raw counts make two periods
 * incomparable the moment their volumes differ: 400 tool-error handoffs in a
 * busy week and 380 in a quiet one is a rise, not the fall the counts imply.
 * Dividing by volume is the whole reason this widget can be trusted against
 * the comparison period, and the ⓘ glossary says so.
 *
 * "Abandoned" sits alongside the handoff reasons even though it is an outcome
 * rather than a reason. From the director's side it is the same question —
 * a call the agent did not finish — and leaving it out would let the widget
 * add up to less than the failures the KPI row reports.
 */

import { HANDOFF_REASONS } from '../data/dictionaries'
import type { Aggregates } from '../engine/types'
import { compareRates, type Comparison } from '../lib/stats'

/** Rates are quoted against this many calls. */
export const PER = 100

export type ReasonKind = 'handoff' | 'abandoned'

export type ReasonRow = {
  key: string
  kind: ReasonKind
  /** Handoff code, or -1 for abandoned. */
  code: number
  /** Occurrences per 100 calls in the current period. */
  currentPer100: number
  /** Same for the comparison period. Zero when there is no comparison. */
  previousPer100: number
  /** Change in the underlying rate, with its significance. */
  delta: Comparison
}

export type ReasonsView = {
  rows: ReasonRow[]
  currentCalls: number
  previousCalls: number
  /** The most common reason in the current period, or null if there are none. */
  top: ReasonRow | null
  /** Rows whose change is bigger than sampling noise. */
  notable: ReasonRow[]
}

function per100(count: number, calls: number): number {
  return calls > 0 ? (count / calls) * PER : 0
}

/**
 * One row per handoff reason plus abandoned, sorted by current rate
 * descending.
 */
export function buildReasonRows(aggregates: Aggregates): ReasonsView {
  const currentCalls = aggregates.current.calls
  const previousCalls = aggregates.previous.calls

  const rows: ReasonRow[] = HANDOFF_REASONS.map((id, code) => {
    const current = aggregates.reasons.current[code] ?? 0
    const previous = aggregates.reasons.previous[code] ?? 0

    return {
      key: id,
      kind: 'handoff' as const,
      code,
      currentPer100: per100(current, currentCalls),
      previousPer100: per100(previous, previousCalls),
      // The z-test works on the underlying proportions; per-100 is presentation.
      delta: compareRates(current, currentCalls, previous, previousCalls),
    }
  })

  rows.push({
    key: 'abandoned',
    kind: 'abandoned',
    code: -1,
    currentPer100: per100(aggregates.current.abandoned, currentCalls),
    previousPer100: per100(aggregates.previous.abandoned, previousCalls),
    delta: compareRates(
      aggregates.current.abandoned,
      currentCalls,
      aggregates.previous.abandoned,
      previousCalls,
    ),
  })

  rows.sort((a, b) => b.currentPer100 - a.currentPer100)

  return {
    rows,
    currentCalls,
    previousCalls,
    top: rows.find((row) => row.currentPer100 > 0) ?? null,
    notable: rows.filter((row) => row.delta.verdict === 'notable'),
  }
}
