/**
 * Aggregates for the current filters, without the flicker.
 *
 * The rule this hook exists to enforce: **the last good answer stays on screen
 * until a better one arrives.** Clearing the data while a new query runs would
 * make every filter click flash a skeleton over numbers the reader is
 * mid-sentence about, and the query takes about four milliseconds — the
 * skeleton would be a worse experience than no feedback at all.
 *
 * So there are three states, not two: showing data, showing data *and*
 * recomputing, and the one-time empty state before the first result. Only the
 * middle one is new, and it only announces itself after 150 ms, which is
 * roughly where a person stops believing a UI responded instantly.
 */

import { useEffect, useMemo, useState } from 'react'

import type { EngineClient } from '../engine/client'
import { comparisonCoverage, comparisonRange, type DataBounds } from './presets'
import type { Aggregates, Query } from '../engine/types'
import type { FilterState } from './url'

/** Below this, a spinner would appear and vanish before it could be read. */
const UPDATING_INDICATOR_DELAY_MS = 150

export type AggregatesHandle = {
  /** The most recent successful result, kept across refetches. `null` only before the first. */
  data: Aggregates | null
  /** True only once a request has been slow enough to be worth mentioning. */
  isFetching: boolean
  workerMs: number
  roundTripMs: number
  /** Set if the last attempt failed; `data` still holds the last good result. */
  error: string | null
}

/**
 * The engine query implied by a filter state and the data it runs against.
 *
 * The comparison range is resolved here rather than in the engine, because
 * this is the layer that knows both the weekly rhythm (so the comparison must
 * be weekday-aligned) and whether the reader asked for a comparison at all.
 * `null` when comparison is off, or when there is no history to compare with.
 */
export function queryOf(state: FilterState, bounds: DataBounds): Query {
  const wanted = state.compare && comparisonCoverage(state.range, bounds) !== 'none'

  return {
    range: state.range,
    compare: wanted ? comparisonRange(state.range) : null,
    agents: state.agents,
    intents: state.intents,
    languages: state.languages,
  }
}

export function useAggregates(
  client: EngineClient | null,
  state: FilterState,
  bounds: DataBounds,
): AggregatesHandle {
  const [data, setData] = useState<Aggregates | null>(null)
  const [isFetching, setIsFetching] = useState(false)
  const [timings, setTimings] = useState({ workerMs: 0, roundTripMs: 0 })
  const [error, setError] = useState<string | null>(null)

  /*
   * A filter state is a fresh object on every render, but its *contents* are
   * what should trigger a refetch. Keying on the serialized query and
   * rebuilding the object from that key gives an identity that changes exactly
   * when the query does — so the effect can depend on it honestly, with no
   * ref written during render and no chance of a refetch loop if a caller
   * hands us a new object each time.
   */
  const queryKey = JSON.stringify(queryOf(state, bounds))
  const query = useMemo(() => JSON.parse(queryKey) as Query, [queryKey])

  useEffect(() => {
    if (client === null) return

    let cancelled = false
    const indicator = setTimeout(() => {
      if (!cancelled) setIsFetching(true)
    }, UPDATING_INDICATOR_DELAY_MS)

    void (async () => {
      try {
        const response = await client.aggregate(query)
        if (cancelled) return

        // A superseded request. The newer one owns the indicator and the
        // data, so this one must touch neither.
        if (response.stale) return

        setData(response.result)
        setTimings({ workerMs: response.workerMs, roundTripMs: response.roundTripMs })
        setError(null)
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : String(cause))
      } finally {
        if (!cancelled) {
          clearTimeout(indicator)
          setIsFetching(false)
        }
      }
    })()

    return () => {
      cancelled = true
      clearTimeout(indicator)
    }
  }, [client, query])

  return { data, isFetching, ...timings, error }
}
