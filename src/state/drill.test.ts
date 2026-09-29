import { describe, expect, it } from 'vitest'

import { HANDOFF_REASONS, OUTCOMES } from '../data/dictionaries'
import { isoToDayIndex } from '../lib/time/riyadh'
import { codeFor } from './codes'
import {
  DRILL_OUTCOMES,
  drillContradictsFilters,
  drillQuery,
  parseDrill,
  serializeDrill,
  withoutOutcome,
  type DrillRequest,
} from './drill'
import { boundsOf, type DataBounds } from './presets'
import { defaultFilterState, type FilterState } from './url'

const day = (iso: string): number => isoToDayIndex(iso)
const bounds: DataBounds = boundsOf({ firstDay: day('2026-06-29'), days: 90 })
const filters: FilterState = defaultFilterState(bounds)
const DASH = filters.range

const MAJED = codeFor('agents', 'agent_06')!
const ROAMING = codeFor('intents', 'roaming')!
const TOOL_ERROR = HANDOFF_REASONS.indexOf('tool_error')

const req = (partial: Partial<DrillRequest> = {}): DrillRequest => ({
  range: DASH,
  constraints: {},
  source: 'kpis',
  ...partial,
})

describe('serializeDrill', () => {
  it('writes readable ids, never numeric codes', () => {
    const value = serializeDrill(
      req({ constraints: { intent: ROAMING, agent: MAJED, outcome: 'unresolved' } }),
      DASH,
    )

    expect(value).toBe('intent:roaming,agent:agent_06,outcome:unresolved')
    expect(value).not.toMatch(/intent:\d/)
  })

  it('omits the range when it matches the dashboard', () => {
    expect(serializeDrill(req({ constraints: { agent: MAJED } }), DASH)).toBe('agent:agent_06')
  })

  it('spells the range out when it differs', () => {
    const single = day('2026-08-25')
    const value = serializeDrill(req({ range: { from: single, to: single } }), DASH)

    expect(value).toBe('from:2026-08-25,to:2026-08-25')
  })

  it('keeps a fixed key order whatever order the constraints were built in', () => {
    const value = serializeDrill(
      req({ constraints: { hasToolErrors: true, outcome: 'transferred', agent: MAJED } }),
      DASH,
    )
    expect(value).toBe('agent:agent_06,outcome:transferred,toolerrors:yes')
  })

  it('names a drill that narrows nothing, rather than emitting nothing', () => {
    /*
     * The empty string was indistinguishable from "no drill": the parameter
     * was dropped and the panel never opened, so the Calls KPI looked like a
     * number that was not clickable. "All the calls on screen" is a real
     * request and needs a word of its own.
     */
    expect(serializeDrill(req(), DASH)).toBe('all')
  })
})

describe('round trip', () => {
  const cases: { name: string; request: DrillRequest }[] = [
    { name: 'empty', request: req() },
    { name: 'one intent', request: req({ constraints: { intent: ROAMING } }) },
    {
      name: 'agent and outcome',
      request: req({ constraints: { agent: MAJED, outcome: 'transferred' } }),
    },
    { name: 'unresolved', request: req({ constraints: { outcome: 'unresolved' } }) },
    { name: 'handoff reason', request: req({ constraints: { handoff: TOOL_ERROR } }) },
    { name: 'tool errors', request: req({ constraints: { hasToolErrors: true } }) },
    {
      name: 'a single day',
      request: req({ range: { from: day('2026-08-25'), to: day('2026-08-25') } }),
    },
    {
      name: 'everything at once',
      request: req({
        range: { from: day('2026-08-01'), to: day('2026-08-31') },
        constraints: {
          intent: ROAMING,
          agent: MAJED,
          outcome: 'abandoned',
          handoff: TOOL_ERROR,
          hasToolErrors: true,
        },
      }),
    },
  ]

  it.each(cases)('survives serialize -> parse: $name', ({ request }) => {
    const search = `?drill=${serializeDrill(request, DASH)}`
    const { request: back, invalid } = parseDrill(search, DASH, bounds)

    expect(invalid).toBe(false)
    expect(back).not.toBeNull()
    expect(back!.range).toEqual(request.range)
    expect(back!.constraints).toEqual(request.constraints)
  })

  it('is stable: re-serializing a parsed drill gives the same string', () => {
    for (const { request } of cases) {
      const once = serializeDrill(request, DASH)
      const parsed = parseDrill(`?drill=${once}`, DASH, bounds).request!
      expect(serializeDrill(parsed, DASH)).toBe(once)
    }
  })

  it('accepts every outcome the URL can name', () => {
    for (const outcome of DRILL_OUTCOMES) {
      const { request, invalid } = parseDrill(`?drill=outcome:${outcome}`, DASH, bounds)
      expect(invalid, outcome).toBe(false)
      expect(request!.constraints.outcome, outcome).toBe(outcome)
    }
  })
})

describe('parseDrill never throws and rejects what it cannot honour', () => {
  it('opens a drill that narrows nothing', () => {
    // The Calls KPI and the All chip both ask for this. It has to be a drill
    // the panel can open, not a value the parser reads as "never mind".
    const { request, invalid } = parseDrill('?drill=all', DASH, bounds)

    expect(invalid).toBe(false)
    expect(request).not.toBeNull()
    expect(request!.constraints).toEqual({})
    expect(request!.range).toEqual(DASH)
  })

  it('reports no drill when the parameter is absent or empty', () => {
    for (const search of ['', '?agents=agent_06', '?drill=', '?drill=%20']) {
      const result = parseDrill(search, DASH, bounds)
      expect(result.request, search).toBeNull()
      expect(result.invalid, search).toBe(false)
    }
  })

  it.each([
    ['an unknown key', 'weekday:3'],
    ['a pair with no colon', 'roaming'],
    ['an empty value', 'intent:'],
    ['an unknown intent', 'intent:teleportation'],
    ['an unknown agent', 'agent:agent_99'],
    ['an unknown outcome', 'outcome:pending'],
    ['an unknown handoff', 'handoff:because'],
    ['a non-yes toolerrors', 'toolerrors:maybe'],
    ['a malformed date', 'from:2026-13-40,to:2026-09-01'],
    ['half a range', 'from:2026-08-01'],
    ['a range outside the data', 'from:2019-01-01,to:2019-02-01'],
  ])('rejects %s', (_name, value) => {
    const result = parseDrill(`?drill=${value}`, DASH, bounds)

    expect(result.request).toBeNull()
    expect(result.invalid).toBe(true)
  })

  it('swaps a backwards range rather than rejecting it', () => {
    const { request } = parseDrill('?drill=from:2026-08-31,to:2026-08-01', DASH, bounds)
    expect(request!.range).toEqual({ from: day('2026-08-01'), to: day('2026-08-31') })
  })

  it('clamps a range that overhangs the data', () => {
    const { request, invalid } = parseDrill('?drill=from:2020-01-01,to:2026-07-05', DASH, bounds)

    expect(invalid).toBe(false)
    expect(request!.range.from).toBe(bounds.firstDay)
  })

  it('falls back to the dashboard range when the drill names no days', () => {
    const { request } = parseDrill('?drill=intent:roaming', DASH, bounds)
    expect(request!.range).toEqual(DASH)
  })

  it('never throws, whatever it is handed', () => {
    for (const value of ['%%%', ':::', ',,,', 'a:b:c', 'intent:roaming,', '=', 'from:to']) {
      expect(() => parseDrill(`?drill=${value}`, DASH, bounds), value).not.toThrow()
    }
  })
})

describe('drillQuery', () => {
  it('never asks for a comparison period', () => {
    // A list of calls has no "previous"; it shows what happened, not a change.
    expect(drillQuery(req(), filters).query.compare).toBeNull()
  })

  it('carries the dashboard filters through unmodified', () => {
    const narrowed: FilterState = { ...filters, agents: [1, 2], languages: [0] }
    const { query } = drillQuery(req({ constraints: { intent: ROAMING } }), narrowed)

    expect(query.agents).toEqual([1, 2])
    expect(query.languages).toEqual([0])
    expect(query.range).toEqual(DASH)
  })

  it('maps each constraint onto the engine target', () => {
    const { target } = drillQuery(
      req({
        constraints: {
          intent: ROAMING,
          agent: MAJED,
          outcome: 'transferred',
          handoff: TOOL_ERROR,
          hasToolErrors: true,
        },
      }),
      filters,
    )

    expect(target).toEqual({
      period: 'current',
      intent: ROAMING,
      agent: MAJED,
      handoff: TOOL_ERROR,
      hasToolErrors: true,
      outcome: OUTCOMES.indexOf('transferred'),
    })
  })

  it('turns "unresolved" into resolved:false, not an outcome code', () => {
    const { target } = drillQuery(req({ constraints: { outcome: 'unresolved' } }), filters)

    expect(target.resolved).toBe(false)
    expect(target.outcome).toBeUndefined()
  })

  it('leaves the target bare for an unconstrained drill', () => {
    expect(drillQuery(req(), filters).target).toEqual({ period: 'current' })
  })
})

describe('contradiction between the drill and the filters', () => {
  it('detects an intent the filter excludes', () => {
    // Drilling into roaming while the dashboard shows only billing: the
    // engine will return nothing, and the panel has to say why rather than
    // quietly widening to show something.
    const billingOnly: FilterState = { ...filters, intents: [codeFor('intents', 'bill_inquiry')!] }
    const request = req({ constraints: { intent: ROAMING } })

    expect(drillContradictsFilters(request, billingOnly)).toBe(true)

    // And the query really does exclude it: both lists are intersected.
    const { query, target } = drillQuery(request, billingOnly)
    expect(query.intents).not.toContain(ROAMING)
    expect(target.intent).toBe(ROAMING)
  })

  it('detects an agent the filter excludes', () => {
    const others: FilterState = { ...filters, agents: [0, 1] }
    expect(drillContradictsFilters(req({ constraints: { agent: MAJED } }), others)).toBe(true)
  })

  it('finds no contradiction when the filter is empty', () => {
    expect(drillContradictsFilters(req({ constraints: { intent: ROAMING } }), filters)).toBe(false)
  })

  it('finds no contradiction when the filter includes the drilled value', () => {
    const withRoaming: FilterState = { ...filters, intents: [ROAMING, 0] }
    expect(drillContradictsFilters(req({ constraints: { intent: ROAMING } }), withRoaming)).toBe(
      false,
    )
  })
})

describe('withoutOutcome', () => {
  it('strips the outcome so the chips can count the base set', () => {
    const request = req({ constraints: { intent: ROAMING, outcome: 'abandoned' } })
    const base = withoutOutcome(request)

    expect(base.constraints.outcome).toBeUndefined()
    expect(base.constraints.intent).toBe(ROAMING)
    // The original is untouched.
    expect(request.constraints.outcome).toBe('abandoned')
  })
})
