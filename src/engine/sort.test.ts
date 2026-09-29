/**
 * Differential tests for the sort, against a plain Array sort over `getCall()`
 * objects.
 *
 * Same idea as the aggregation tests: the fast version works on typed arrays
 * and precomputed keys, so it gets checked against an obviously-correct one
 * that materialises objects and sorts them with string and number comparisons.
 */

import { beforeAll, describe, expect, it } from 'vitest'

import { AGENTS, INTENTS, LANGUAGES, OUTCOMES } from '../data/dictionaries'
import { generateDataset } from '../data/generate'
import { getCall } from '../data/getCall'
import type { Call, Dataset } from '../data/types'
import { isoToDayIndex } from '../lib/time/riyadh'
import { comparisonRange } from '../state/presets'
import { drill } from './aggregate'
import { sortRows, type SortDirection, type SortKey, type SortRanks } from './sort'

let ds: Dataset
let rows: Uint32Array

beforeAll(() => {
  ds = generateDataset()
  // One week of real rows: big enough for ties in every column.
  const range = { from: isoToDayIndex('2026-09-20'), to: isoToDayIndex('2026-09-26') }
  rows = drill(
    ds,
    { range, compare: comparisonRange(range), agents: [], intents: [], languages: [] },
    { period: 'current' },
  )
})

/** Ranks that put agents and intents in their English display order. */
function englishRanks(): SortRanks {
  const rank = (names: readonly string[]): number[] => {
    const order = names.map((name, code) => ({ name, code }))
    order.sort((a, b) => a.name.localeCompare(b.name))
    const ranks = new Array<number>(names.length)
    order.forEach(({ code }, position) => {
      ranks[code] = position
    })
    return ranks
  }

  return {
    agents: rank(AGENTS.map((agent) => agent.nameEn)),
    intents: rank(INTENTS.map((intent) => intent.labelEn)),
  }
}

/** The obviously-correct version: materialise, then sort with plain comparisons. */
function referenceSort(
  indices: Uint32Array,
  key: SortKey,
  direction: SortDirection,
  ranks: SortRanks,
): number[] {
  const sign = direction === 'asc' ? 1 : -1

  const valueOf = (call: Call, row: number): number => {
    switch (key) {
      case 'time':
        return Date.parse(call.startedAt) / 1000
      case 'agent': {
        const code = AGENTS.findIndex((agent) => agent.id === call.agentId)
        return ranks.agents?.[code] ?? code
      }
      case 'intent': {
        const code = INTENTS.findIndex((intent) => intent.id === call.intent)
        return ranks.intents?.[code] ?? code
      }
      case 'language':
        return LANGUAGES.indexOf(call.language)
      case 'outcome':
        return OUTCOMES.indexOf(call.outcome)
      case 'handoff':
        return ds.handoff[row]!
      case 'duration':
        return call.durationSec
      case 'sentimentEnd':
        return Math.round(call.sentimentEnd * 100)
      case 'sentimentChange':
        return Math.round(call.sentimentEnd * 100) - Math.round(call.sentimentStart * 100)
      case 'toolErrors':
        return call.toolErrors
    }
  }

  const decorated = Array.from(indices).map((row) => {
    const call = getCall(ds, row)
    return { row, value: valueOf(call, row), time: Date.parse(call.startedAt) / 1000 }
  })

  decorated.sort((a, b) => {
    const difference = a.value - b.value
    if (difference !== 0) return sign * difference
    return b.time - a.time
  })

  return decorated.map((entry) => entry.row)
}

const KEYS: SortKey[] = [
  'time',
  'agent',
  'intent',
  'language',
  'outcome',
  'handoff',
  'duration',
  'sentimentEnd',
  'sentimentChange',
  'toolErrors',
]

describe('sortRows matches a plain Array sort', () => {
  const cases = KEYS.flatMap((key) =>
    (['asc', 'desc'] as SortDirection[]).map((direction) => ({ key, direction })),
  )

  it.each(cases)('$key $direction', ({ key, direction }) => {
    const ranks = englishRanks()
    const actual = Array.from(sortRows(ds, rows, key, direction, ranks))

    expect(actual).toEqual(referenceSort(rows, key, direction, ranks))
  })
})

describe('sortRows invariants', () => {
  it('returns a permutation: same rows, none lost, none duplicated', () => {
    const sorted = sortRows(ds, rows, 'duration', 'desc')

    expect(sorted.length).toBe(rows.length)
    expect([...sorted].sort((a, b) => a - b)).toEqual([...rows].sort((a, b) => a - b))
  })

  it('does not modify the input', () => {
    const before = Array.from(rows)
    sortRows(ds, rows, 'agent', 'asc', englishRanks())
    expect(Array.from(rows)).toEqual(before)
  })

  it('breaks ties by time, newest first, in both directions', () => {
    for (const direction of ['asc', 'desc'] as SortDirection[]) {
      const sorted = sortRows(ds, rows, 'outcome', direction)

      for (let i = 1; i < sorted.length; i++) {
        const previous = sorted[i - 1]!
        const current = sorted[i]!
        if (ds.outcome[previous] !== ds.outcome[current]) continue
        // Within one outcome, later calls come first.
        expect(ds.startedAt[previous]!, direction).toBeGreaterThanOrEqual(ds.startedAt[current]!)
      }
    }
  })

  it('orders agents by the ranks it is given, not by code', () => {
    // Deliberately reverse the codes: a code-order sort would be unchanged.
    const reversed = AGENTS.map((_, code) => AGENTS.length - 1 - code)
    const sorted = sortRows(ds, rows, 'agent', 'asc', { agents: reversed })

    for (let i = 1; i < sorted.length; i++) {
      expect(reversed[ds.agent[sorted[i - 1]!]!]!).toBeLessThanOrEqual(
        reversed[ds.agent[sorted[i]!]!]!,
      )
    }
  })

  it('falls back to code order when no rank is supplied', () => {
    const sorted = sortRows(ds, rows, 'agent', 'asc')
    for (let i = 1; i < sorted.length; i++) {
      expect(ds.agent[sorted[i - 1]!]!).toBeLessThanOrEqual(ds.agent[sorted[i]!]!)
    }
  })

  it('sorts an absent handoff last when ascending', () => {
    // 255 means "no handoff"; an absence belongs at the end, not in the middle.
    const sorted = sortRows(ds, rows, 'handoff', 'asc')
    const lastReal = Array.from(sorted).findIndex((row) => ds.handoff[row] === 255)

    if (lastReal === -1) return
    for (let i = lastReal; i < sorted.length; i++) {
      expect(ds.handoff[sorted[i]!]).toBe(255)
    }
  })

  it('handles an empty list and a single row', () => {
    expect(sortRows(ds, new Uint32Array(0), 'time', 'asc').length).toBe(0)

    const one = rows.slice(0, 1)
    expect(Array.from(sortRows(ds, one, 'duration', 'desc'))).toEqual([one[0]])
  })
})
