/**
 * Ordering a list of rows, off the main thread.
 *
 * Sorting 200,000 row indices is a few tens of milliseconds — comfortably
 * enough to drop a frame if it happens while the user is scrolling, and
 * pointless to do on the UI thread when the dataset already lives in the
 * worker. The main thread sends a key and a direction and gets back a new
 * index array.
 *
 * ## Why agent and intent need a rank array
 *
 * Their stored values are dictionary codes, and code order is arbitrary —
 * `agent_01` before `agent_02` says nothing about where "Sara" and "فهد" fall
 * in either alphabet. Sorting by code would produce an order that looks random
 * to the reader and *changes meaning* between languages without changing.
 *
 * The worker cannot resolve that itself: it has no locale and no `Intl` (which
 * lives behind `format.ts` on the main thread by design). So the main thread
 * computes a rank per code for the current UI language and passes it in. The
 * worker does integer comparisons; the localized collation stays where the
 * localization is.
 */

import type { Dataset } from '../data/types'

export type SortKey =
  | 'time'
  | 'agent'
  | 'intent'
  | 'language'
  | 'outcome'
  | 'handoff'
  | 'duration'
  | 'sentimentEnd'
  | 'sentimentChange'
  | 'toolErrors'

export type SortDirection = 'asc' | 'desc'

/**
 * Display-order rank per dictionary code, for the keys whose stored value is
 * a code. Index = code, value = position in the localized sort.
 */
export type SortRanks = {
  agents?: readonly number[]
  intents?: readonly number[]
}

/** The value a row sorts on, for a given key. */
function valueOf(ds: Dataset, row: number, key: SortKey, ranks: SortRanks): number {
  switch (key) {
    case 'time':
      return ds.startedAt[row]!
    case 'agent':
      return ranks.agents?.[ds.agent[row]!] ?? ds.agent[row]!
    case 'intent':
      return ranks.intents?.[ds.intent[row]!] ?? ds.intent[row]!
    case 'language':
      return ds.language[row]!
    case 'outcome':
      return ds.outcome[row]!
    case 'handoff':
      // 255 means "no handoff", which sorts last ascending — an absence
      // belongs at the end, not between two reasons.
      return ds.handoff[row]!
    case 'duration':
      return ds.durationSec[row]!
    case 'sentimentEnd':
      return ds.sentEnd[row]!
    case 'sentimentChange':
      return ds.sentEnd[row]! - ds.sentStart[row]!
    case 'toolErrors':
      return ds.toolErrors[row]!
  }
}

/**
 * Sort row indices, returning a new array.
 *
 * Ties break by time, newest first, whatever the key and direction. Without a
 * tiebreak, sorting by outcome would order the calls within each outcome
 * arbitrarily, and re-sorting by the same column could shuffle them — which
 * reads as data changing under the reader. Newest-first matches the default
 * view, so the secondary order is always the one they started with.
 */
export function sortRows(
  ds: Dataset,
  rows: Uint32Array,
  key: SortKey,
  direction: SortDirection,
  ranks: SortRanks = {},
): Uint32Array {
  const sign = direction === 'asc' ? 1 : -1

  // Values are precomputed rather than read inside the comparator: the
  // comparator runs O(n log n) times, and for 200k rows that is ~3.5M calls
  // into a switch and four typed-array reads it does not need to repeat.
  const keys = new Float64Array(rows.length)
  const times = new Float64Array(rows.length)
  for (let i = 0; i < rows.length; i++) {
    const row = rows[i]!
    keys[i] = valueOf(ds, row, key, ranks)
    times[i] = ds.startedAt[row]!
  }

  // Sort positions, so both precomputed arrays stay addressable by index.
  const order = new Uint32Array(rows.length)
  for (let i = 0; i < rows.length; i++) order[i] = i

  const sorted = Array.from(order).sort((a, b) => {
    const difference = keys[a]! - keys[b]!
    if (difference !== 0) return sign * difference
    // Newest first, regardless of direction.
    return times[b]! - times[a]!
  })

  const out = new Uint32Array(rows.length)
  for (let i = 0; i < sorted.length; i++) out[i] = rows[sorted[i]!]!
  return out
}
