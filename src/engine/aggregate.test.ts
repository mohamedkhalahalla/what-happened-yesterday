import { beforeAll, describe, expect, it } from 'vitest'

import { isoToDayIndex, previousPeriod, weekday } from '../lib/time/riyadh'
import { AGENTS, HANDOFF_REASONS, INTENTS, LANGUAGES, OUTCOMES } from '../data/dictionaries'
import { generateDataset } from '../data/generate'
import { mulberry32, uniformInt, type Rng } from '../data/prng'
import type { Dataset } from '../data/types'
import { aggregate, drill, emptyCounts } from './aggregate'
import { reference, referenceDrill } from './reference'
import type { Counts, DrillTarget, Query } from './types'

let ds: Dataset

beforeAll(() => {
  ds = generateDataset()
})

const day = (iso: string): number => isoToDayIndex(iso)

/** A query with no filters over the given inclusive ISO date range. */
function q(fromISO: string, toISO: string, extra: Partial<Query> = {}): Query {
  return {
    range: { from: day(fromISO), to: day(toISO) },
    agents: [],
    intents: [],
    languages: [],
    ...extra,
  }
}

const intentCode = (id: string): number => INTENTS.findIndex((it) => it.id === id)
const agentCode = (id: string): number => AGENTS.findIndex((a) => a.id === id)

const ALL_DAYS = { fromISO: '2026-06-29', toISO: '2026-09-26' }
const LAST_WEEK = { fromISO: '2026-09-20', toISO: '2026-09-26' }

function addCounts(a: Counts, b: Counts): Counts {
  return {
    calls: a.calls + b.calls,
    resolved: a.resolved + b.resolved,
    transferred: a.transferred + b.transferred,
    abandoned: a.abandoned + b.abandoned,
    toolErrorCalls: a.toolErrorCalls + b.toolErrorCalls,
    toolErrorsSum: a.toolErrorsSum + b.toolErrorsSum,
  }
}

/** Queries the differential tests run. Hand-picked to hit the awkward shapes. */
function namedQueries(): { name: string; query: Query }[] {
  return [
    { name: 'all data, no filters', query: q(ALL_DAYS.fromISO, ALL_DAYS.toISO) },
    { name: 'last full week', query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO) },
    { name: 'a single day (Sunday)', query: q('2026-09-20', '2026-09-20') },
    { name: 'a single day (Friday)', query: q('2026-09-25', '2026-09-25') },
    { name: 'the first day of the dataset', query: q('2026-06-29', '2026-06-29') },
    { name: 'the last day of the dataset', query: q('2026-09-26', '2026-09-26') },
    { name: 'crossing the Ramadan start', query: q('2026-07-19', '2026-07-29') },
    { name: 'crossing the Ramadan end', query: q('2026-08-17', '2026-08-27') },
    { name: 'the whole of Ramadan', query: q('2026-07-24', '2026-08-22') },
    { name: 'the bad deploy day', query: q('2026-08-25', '2026-08-25') },
    {
      name: 'a single agent',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO, { agents: [agentCode('agent_06')] }),
    },
    {
      name: 'every agent listed explicitly (same as no filter)',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO, { agents: AGENTS.map((_, i) => i) }),
    },
    {
      name: 'multiple intents plus one language',
      query: q('2026-09-01', '2026-09-26', {
        intents: [intentCode('roaming'), intentCode('bill_inquiry'), intentCode('no_service')],
        languages: [LANGUAGES.indexOf('ar')],
      }),
    },
    {
      name: 'one intent across the whole quarter',
      query: q(ALL_DAYS.fromISO, ALL_DAYS.toISO, { intents: [intentCode('roaming')] }),
    },
    {
      name: 'three agents and two languages',
      query: q('2026-08-01', '2026-08-31', {
        agents: [0, 3, 5],
        languages: [LANGUAGES.indexOf('ar'), LANGUAGES.indexOf('en')],
      }),
    },
    {
      name: 'filters matching nothing (impossible agent/intent pair is fine, empty result)',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO, {
        agents: [agentCode('agent_01')],
        intents: [intentCode('store_locator')],
        languages: [LANGUAGES.indexOf('en')],
      }),
    },
    {
      name: 'a range whose previous period falls off the front of the dataset',
      query: q('2026-06-29', '2026-07-20'),
    },
    {
      name: 'a range entirely before the dataset',
      query: q('2026-01-01', '2026-01-07'),
    },
    {
      name: 'a range entirely after the dataset',
      query: q('2026-12-01', '2026-12-07'),
    },
    {
      name: 'a range wider than the dataset on both sides',
      query: q('2026-01-01', '2026-12-31'),
    },
  ]
}

/** Extra coverage: queries nobody would think to write by hand. */
function randomQuery(rng: Rng): Query {
  const lastDay = ds.firstDay + ds.days - 1
  // Deliberately allowed to run past both ends of the dataset.
  const from = uniformInt(rng, ds.firstDay - 10, lastDay + 5)
  const to = from + uniformInt(rng, 0, 40)

  const pickSome = (size: number): number[] => {
    const chosen: number[] = []
    for (let code = 0; code < size; code++) {
      if (rng() < 0.25) chosen.push(code)
    }
    return chosen
  }

  return {
    range: { from, to },
    agents: pickSome(AGENTS.length),
    intents: pickSome(INTENTS.length),
    languages: pickSome(LANGUAGES.length),
  }
}

describe('aggregate matches the reference implementation', () => {
  it.each(namedQueries())('$name', ({ query }) => {
    expect(aggregate(ds, query)).toEqual(reference(ds, query))
  })

  it('matches on seeded random queries', () => {
    const rng = mulberry32(0xbeef)
    for (let k = 0; k < 8; k++) {
      const query = randomQuery(rng)
      expect(aggregate(ds, query), `random query ${k}: ${JSON.stringify(query.range)}`).toEqual(
        reference(ds, query),
      )
    }
  })
})

describe('period arithmetic', () => {
  it('compares the last full week against the week before it', () => {
    const range = { from: day('2026-09-20'), to: day('2026-09-26') }
    const prev = previousPeriod(range)
    expect(prev.from).toBe(day('2026-09-13'))
    expect(prev.to).toBe(day('2026-09-19'))
  })

  it('puts the same number of days in both periods', () => {
    const range = { from: day('2026-09-20'), to: day('2026-09-26') }
    const prev = previousPeriod(range)
    expect(prev.to - prev.from).toBe(range.to - range.from)
    expect(prev.to).toBe(range.from - 1)
  })
})

describe('invariants', () => {
  const cases = namedQueries()

  it.each(cases)('outcomes partition the calls: $name', ({ query }) => {
    const a = aggregate(ds, query)

    for (const counts of [a.current, a.previous]) {
      expect(counts.resolved + counts.transferred + counts.abandoned).toBe(counts.calls)
    }
    for (const intent of a.intents) {
      expect(intent.current.resolved + intent.current.transferred + intent.current.abandoned).toBe(
        intent.current.calls,
      )
    }
    for (const agent of a.agents) {
      expect(agent.current.resolved + agent.current.transferred + agent.current.abandoned).toBe(
        agent.current.calls,
      )
    }
  })

  it.each(cases)('daily summed over the range equals current: $name', ({ query }) => {
    const a = aggregate(ds, query)
    let summed = emptyCounts()

    for (let offset = 0; offset < ds.days; offset++) {
      const dayIndex = ds.firstDay + offset
      if (dayIndex >= query.range.from && dayIndex <= query.range.to) {
        summed = addCounts(summed, a.daily[offset]!)
      }
    }
    expect(summed).toEqual(a.current)
  })

  it('never counts a call twice: intents and agents both re-total to current', () => {
    const a = aggregate(ds, q(LAST_WEEK.fromISO, LAST_WEEK.toISO))

    const byIntent = a.intents.reduce((acc, it) => addCounts(acc, it.current), emptyCounts())
    const byAgent = a.agents.reduce((acc, ag) => addCounts(acc, ag.current), emptyCounts())

    expect(byIntent).toEqual(a.current)
    expect(byAgent).toEqual(a.current)
  })

  it('counts every transfer under exactly one handoff reason', () => {
    const a = aggregate(ds, q(LAST_WEEK.fromISO, LAST_WEEK.toISO))
    const total = (xs: number[]): number => xs.reduce((x, y) => x + y, 0)

    expect(total(a.reasons.current)).toBe(a.current.transferred)
    expect(total(a.reasons.previous)).toBe(a.previous.transferred)
    expect(a.reasons.current).toHaveLength(HANDOFF_REASONS.length)
  })

  it('puts every current-period call in exactly one heatmap cell', () => {
    const a = aggregate(ds, q(LAST_WEEK.fromISO, LAST_WEEK.toISO))
    expect(a.heatmap).toHaveLength(7 * 24)
    expect(a.heatmap.reduce((x, y) => x + y, 0)).toBe(a.current.calls)
  })

  it('treats empty filter arrays as no filter at all', () => {
    const noFilters = aggregate(ds, q(LAST_WEEK.fromISO, LAST_WEEK.toISO))
    const everythingListed = aggregate(
      ds,
      q(LAST_WEEK.fromISO, LAST_WEEK.toISO, {
        agents: AGENTS.map((_, i) => i),
        intents: INTENTS.map((_, i) => i),
        languages: LANGUAGES.map((_, i) => i),
      }),
    )
    expect(everythingListed).toEqual(noFilters)
  })

  it('ignores the date range for the daily and weekly series', () => {
    const wide = aggregate(ds, q(ALL_DAYS.fromISO, ALL_DAYS.toISO))
    const narrow = aggregate(ds, q('2026-09-20', '2026-09-20'))

    // Same filters (none), so the full-history series must be identical.
    expect(narrow.daily).toEqual(wide.daily)
    expect(narrow.weekStarts).toEqual(wide.weekStarts)
    expect(narrow.intents.map((i) => i.weekly)).toEqual(wide.intents.map((i) => i.weekly))
    // …but the period totals clearly are not.
    expect(narrow.current.calls).toBeLessThan(wide.current.calls)
  })

  it('buckets weeks from the Sunday on or before the first data day', () => {
    const a = aggregate(ds, q(LAST_WEEK.fromISO, LAST_WEEK.toISO))

    expect(a.weekStarts[0]).toBe(day('2026-06-28')) // the Sunday before 2026-06-29
    for (const start of a.weekStarts) expect(weekday(start)).toBe(0)
    for (const intent of a.intents) expect(intent.weekly).toHaveLength(a.weekStarts.length)

    // Every call lands in some week, so the weekly series re-totals to the dataset.
    const weeklyCalls = a.intents
      .flatMap((i) => i.weekly)
      .reduce((total, counts) => total + counts.calls, 0)
    expect(weeklyCalls).toBe(ds.n)
  })

  it('returns zeroed counts when the filters match nothing', () => {
    const a = aggregate(
      ds,
      q(LAST_WEEK.fromISO, LAST_WEEK.toISO, { agents: [], intents: [], languages: [] }),
    )
    // Sanity check on the harness itself: no filters is NOT the empty case.
    expect(a.current.calls).toBeGreaterThan(0)

    const impossible = aggregate(ds, {
      range: { from: day('2026-09-20'), to: day('2026-09-26') },
      agents: [99],
      intents: [],
      languages: [],
    })
    expect(impossible.current).toEqual(emptyCounts())
    expect(impossible.previous).toEqual(emptyCounts())
    expect(impossible.heatmap.reduce((x, y) => x + y, 0)).toBe(0)
  })
})

describe('drill', () => {
  const targets: { name: string; query: Query; target: DrillTarget }[] = [
    {
      name: 'every row in the last week',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO),
      target: { period: 'current' },
    },
    {
      name: 'the previous period of the last week',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO),
      target: { period: 'previous' },
    },
    {
      name: 'one day inside the period',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO),
      target: { period: 'current', day: day('2026-09-22') },
    },
    {
      name: 'a day outside the period (matches nothing)',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO),
      target: { period: 'current', day: day('2026-08-01') },
    },
    {
      name: 'roaming transfers across the whole quarter',
      query: q(ALL_DAYS.fromISO, ALL_DAYS.toISO),
      target: {
        period: 'current',
        intent: intentCode('roaming'),
        outcome: OUTCOMES.indexOf('transferred'),
      },
    },
    {
      name: 'one agent, one outcome',
      query: q(ALL_DAYS.fromISO, ALL_DAYS.toISO),
      target: {
        period: 'current',
        agent: agentCode('agent_06'),
        outcome: OUTCOMES.indexOf('transferred'),
      },
    },
    {
      name: 'a handoff reason',
      query: q(LAST_WEEK.fromISO, LAST_WEEK.toISO),
      target: { period: 'current', handoff: HANDOFF_REASONS.indexOf('tool_error') },
    },
    {
      name: 'one heatmap cell (Tuesday 14:00)',
      query: q(ALL_DAYS.fromISO, ALL_DAYS.toISO),
      target: { period: 'current', weekday: 2, hour: 14 },
    },
    {
      name: 'calls with tool errors on the deploy day',
      query: q('2026-08-25', '2026-08-25'),
      target: { period: 'current', hasToolErrors: true },
    },
    {
      name: 'calls without tool errors on the deploy day',
      query: q('2026-08-25', '2026-08-25'),
      target: { period: 'current', hasToolErrors: false },
    },
    {
      name: 'a drill that also honours the query filters',
      query: q(ALL_DAYS.fromISO, ALL_DAYS.toISO, {
        agents: [agentCode('agent_06')],
        languages: [LANGUAGES.indexOf('ar')],
      }),
      target: { period: 'current', intent: intentCode('roaming') },
    },
  ]

  it.each(targets)('returns exactly the reference rows: $name', ({ query, target }) => {
    const rows = drill(ds, query, target)
    expect(Array.from(rows)).toEqual(referenceDrill(ds, query, target))
  })

  it('returns rows in ascending startedAt order', () => {
    const rows = drill(ds, q(LAST_WEEK.fromISO, LAST_WEEK.toISO), { period: 'current' })
    expect(rows.length).toBeGreaterThan(0)

    let previous = 0
    for (const row of rows) {
      const t = ds.startedAt[row]!
      expect(t).toBeGreaterThanOrEqual(previous)
      previous = t
    }
  })

  it('agrees with the aggregate it drills into', () => {
    const query = q(LAST_WEEK.fromISO, LAST_WEEK.toISO)
    const a = aggregate(ds, query)

    expect(drill(ds, query, { period: 'current' }).length).toBe(a.current.calls)
    expect(drill(ds, query, { period: 'previous' }).length).toBe(a.previous.calls)

    const roaming = intentCode('roaming')
    expect(drill(ds, query, { period: 'current', intent: roaming }).length).toBe(
      a.intents[roaming]!.current.calls,
    )

    const toolError = HANDOFF_REASONS.indexOf('tool_error')
    expect(drill(ds, query, { period: 'current', handoff: toolError }).length).toBe(
      a.reasons.current[toolError],
    )

    // One heatmap cell: Wednesday (weekday 3) at 11:00.
    expect(drill(ds, query, { period: 'current', weekday: 3, hour: 11 }).length).toBe(
      a.heatmap[3 * 24 + 11],
    )
  })

  it('returns an empty array when nothing matches', () => {
    const rows = drill(ds, q('2026-01-01', '2026-01-07'), { period: 'current' })
    expect(rows).toBeInstanceOf(Uint32Array)
    expect(rows.length).toBe(0)
  })
})
