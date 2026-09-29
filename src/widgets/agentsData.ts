/**
 * Comparing agents against each other, not against an absolute target.
 *
 * "Is a 47% transfer rate bad?" has no answer without knowing what the others
 * do. Against a median of 18% it is very bad; against a median of 45% it is
 * ordinary. So the reference line is the **median of the agents currently
 * shown** — median rather than mean because one extreme agent is exactly the
 * thing being looked for, and a mean would be dragged toward them and hide it.
 *
 * Everything here is computed from the data. Nothing reads the planted story.
 */

import type { Aggregates } from '../engine/types'
import { compareRates, type Comparison } from '../lib/stats'
import { AGENT_OUTLIER_RATIO } from '../lib/thresholds'

/**
 * An agent at or above this multiple of the median gets a badge.
 *
 * Re-exported from `thresholds.ts` rather than defined here: the Fix-first
 * detector uses the same number, and two constants that must agree are two
 * constants that will eventually disagree.
 */
export const OUTLIER_MULTIPLE = AGENT_OUTLIER_RATIO

export type AgentRow = {
  code: number
  calls: number
  transferred: number
  transferRate: number
  resolutionRate: number
  /** Change in transfer rate against the comparison period. */
  delta: Comparison
  /** Transfer rate as a multiple of the median. 0 when the median is 0. */
  ratioToMedian: number
  /** True at or above {@link OUTLIER_MULTIPLE} times the median. */
  outlier: boolean
}

export type AgentsView = {
  rows: AgentRow[]
  /** Median transfer rate of the agents shown. 0 when nobody took a call. */
  median: number
  /** The highest-transferring agent, or null when there is nothing to show. */
  worst: AgentRow | null
}

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0
}

/** Middle value, averaging the two middles on an even count. */
export function medianOf(values: readonly number[]): number {
  if (values.length === 0) return 0
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)

  return sorted.length % 2 === 1 ? sorted[middle]! : (sorted[middle - 1]! + sorted[middle]!) / 2
}

/**
 * One row per agent that handled a call, sorted by transfer rate descending.
 *
 * Agents with no calls in the range are dropped rather than shown at 0%: they
 * did not transfer nothing, they did nothing, and a 0% bar would rank them as
 * the best performer.
 */
export function buildAgentRows(aggregates: Aggregates): AgentsView {
  const active = aggregates.agents
    .map((agent, code) => ({ agent, code }))
    .filter(({ agent }) => agent.current.calls > 0)

  const median = medianOf(
    active.map(({ agent }) => ratio(agent.current.transferred, agent.current.calls)),
  )

  const rows: AgentRow[] = active.map(({ agent, code }) => {
    const { current, previous } = agent
    const transferRate = ratio(current.transferred, current.calls)

    return {
      code,
      calls: current.calls,
      transferred: current.transferred,
      transferRate,
      resolutionRate: ratio(current.resolved, current.calls),
      delta: compareRates(current.transferred, current.calls, previous.transferred, previous.calls),
      ratioToMedian: median > 0 ? transferRate / median : 0,
      outlier: median > 0 && transferRate >= median * OUTLIER_MULTIPLE,
    }
  })

  rows.sort((a, b) => b.transferRate - a.transferRate || b.calls - a.calls)

  return { rows, median, worst: rows[0] ?? null }
}
