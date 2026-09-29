import { describe, expect, it } from 'vitest'

import { AGENTS, INTENTS, LANGUAGES } from '../data/dictionaries'
import { dayIndexToISO, isoToDayIndex } from '../lib/time/riyadh'
import { codeFor } from './codes'
import { boundsOf, defaultRange, type DataBounds } from './presets'
import {
  defaultFilterState,
  isDefaultState,
  parse,
  serialize,
  withFilterParams,
  type Correction,
  type FilterState,
} from './url'

const day = (iso: string): number => isoToDayIndex(iso)
const bounds: DataBounds = boundsOf({ firstDay: day('2026-06-29'), days: 90 })

const MAJED = codeFor('agents', 'agent_06')!
const ROAMING = codeFor('intents', 'roaming')!
const ARABIC = codeFor('languages', 'ar')!

/** Just the discriminators, which is what the assertions care about. */
const kinds = (corrections: Correction[]): string[] => corrections.map((c) => c.kind)

describe('serialize', () => {
  it('emits nothing for the default view', () => {
    expect(serialize(defaultFilterState(bounds), bounds)).toBe('')
    expect(isDefaultState(defaultFilterState(bounds), bounds)).toBe(true)
  })

  it('writes readable ids, not engine codes', () => {
    const state: FilterState = {
      range: defaultRange(bounds),
      agents: [MAJED],
      intents: [ROAMING],
      languages: [ARABIC],
      compare: true,
    }
    const search = serialize(state, bounds)
    expect(search).toContain('agents=agent_06')
    expect(search).toContain('intents=roaming')
    expect(search).toContain('language=ar')
    // A numeric code would be unreadable and would break if the dictionaries
    // were ever reordered.
    expect(search).not.toContain('agents=5')
  })

  it('keeps parameters in a fixed order', () => {
    const state: FilterState = {
      range: { from: day('2026-09-01'), to: day('2026-09-10') },
      agents: [MAJED],
      intents: [ROAMING],
      languages: [ARABIC],
      compare: false,
    }
    expect(serialize(state, bounds)).toBe(
      '?from=2026-09-01&to=2026-09-10&agents=agent_06&intents=roaming&language=ar&compare=0',
    )
  })

  it('emits the range as a pair or not at all', () => {
    const state: FilterState = { ...defaultFilterState(bounds), agents: [MAJED] }
    const search = serialize(state, bounds)
    // Default range, so neither endpoint appears...
    expect(search).not.toContain('from=')
    expect(search).not.toContain('to=')

    // ...and a non-default range brings both.
    const moved = serialize(
      { ...state, range: { from: day('2026-09-01'), to: day('2026-09-10') } },
      bounds,
    )
    expect(moved).toContain('from=2026-09-01')
    expect(moved).toContain('to=2026-09-10')
  })

  it('omits compare when it is on, and writes 0 when off', () => {
    expect(serialize(defaultFilterState(bounds), bounds)).not.toContain('compare')
    expect(serialize({ ...defaultFilterState(bounds), compare: false }, bounds)).toBe('?compare=0')
  })
})

describe('round trip', () => {
  const cases: { name: string; state: FilterState }[] = [
    { name: 'the default view', state: defaultFilterState(bounds) },
    {
      name: 'a custom range',
      state: {
        ...defaultFilterState(bounds),
        range: { from: day('2026-07-01'), to: day('2026-08-15') },
      },
    },
    {
      name: 'one agent, one intent, one language',
      state: {
        ...defaultFilterState(bounds),
        agents: [MAJED],
        intents: [ROAMING],
        languages: [ARABIC],
      },
    },
    {
      name: 'several of everything with compare off',
      state: {
        range: { from: day('2026-08-01'), to: day('2026-08-31') },
        agents: [0, 3, MAJED],
        intents: [1, 4, ROAMING],
        languages: [0, 1, 2],
        compare: false,
      },
    },
    {
      name: 'every agent selected',
      state: { ...defaultFilterState(bounds), agents: AGENTS.map((_, i) => i) },
    },
    {
      name: 'a single day',
      state: {
        ...defaultFilterState(bounds),
        range: { from: day('2026-08-25'), to: day('2026-08-25') },
      },
    },
  ]

  it.each(cases)('survives serialize -> parse: $name', ({ state }) => {
    const { state: back, corrections } = parse(serialize(state, bounds), bounds)
    expect(back).toEqual(state)
    expect(corrections).toEqual([])
  })

  it('is stable: serializing a parsed state reproduces the same string', () => {
    for (const { state } of cases) {
      const once = serialize(state, bounds)
      const twice = serialize(parse(once, bounds).state, bounds)
      expect(twice).toBe(once)
    }
  })

  it('does not care about incoming parameter order', () => {
    const canonical = parse(
      '?from=2026-09-01&to=2026-09-10&agents=agent_06&intents=roaming',
      bounds,
    ).state
    const shuffled = parse(
      '?intents=roaming&agents=agent_06&to=2026-09-10&from=2026-09-01',
      bounds,
    ).state
    expect(shuffled).toEqual(canonical)
  })

  it('normalises id order so the same selection has one URL', () => {
    const a = parse('?agents=agent_06,agent_01', bounds).state
    const b = parse('?agents=agent_01,agent_06', bounds).state
    expect(a).toEqual(b)
    expect(serialize(a, bounds)).toBe(serialize(b, bounds))
  })
})

describe('parse never throws and reports what it corrected', () => {
  it('accepts an empty query string', () => {
    const { state, corrections } = parse('', bounds)
    expect(state).toEqual(defaultFilterState(bounds))
    expect(corrections).toEqual([])
  })

  it('falls back on a malformed date', () => {
    const { state, corrections } = parse('?from=not-a-date&to=2026-09-26', bounds)
    expect(state.range).toEqual(defaultRange(bounds))
    expect(kinds(corrections)).toEqual(['invalidDate'])
    expect(corrections[0]).toMatchObject({ param: 'from', value: 'not-a-date' })
  })

  it('falls back on an impossible date', () => {
    const { state, corrections } = parse('?from=2026-02-30&to=2026-09-26', bounds)
    expect(state.range).toEqual(defaultRange(bounds))
    expect(kinds(corrections)).toEqual(['invalidDate'])
  })

  it('falls back on a sloppily formatted date', () => {
    const { corrections } = parse('?from=2026-9-1&to=2026-09-26', bounds)
    expect(kinds(corrections)).toEqual(['invalidDate'])
  })

  it('reports both endpoints when both are bad', () => {
    const { corrections } = parse('?from=x&to=y', bounds)
    expect(kinds(corrections)).toEqual(['invalidDate', 'invalidDate'])
  })

  it('rejects half a range rather than guessing the other end', () => {
    const { state, corrections } = parse('?from=2026-09-01', bounds)
    expect(state.range).toEqual(defaultRange(bounds))
    expect(kinds(corrections)).toEqual(['incompleteRange'])
  })

  it('swaps a backwards range', () => {
    const { state, corrections } = parse('?from=2026-09-26&to=2026-09-20', bounds)
    expect(dayIndexToISO(state.range.from)).toBe('2026-09-20')
    expect(dayIndexToISO(state.range.to)).toBe('2026-09-26')
    expect(kinds(corrections)).toEqual(['rangeSwapped'])
  })

  it('clamps a range that overhangs the data', () => {
    const { state, corrections } = parse('?from=2020-01-01&to=2030-01-01', bounds)
    expect(state.range.from).toBe(bounds.firstDay)
    expect(state.range.to).toBe(bounds.lastDay)
    expect(kinds(corrections)).toEqual(['clampedToData', 'clampedToData'])
  })

  it('clamps only the end that overhangs', () => {
    const { state, corrections } = parse('?from=2026-09-01&to=2030-01-01', bounds)
    expect(dayIndexToISO(state.range.from)).toBe('2026-09-01')
    expect(state.range.to).toBe(bounds.lastDay)
    expect(kinds(corrections)).toEqual(['clampedToData'])
  })

  it('falls back when the range misses the data entirely', () => {
    const { state, corrections } = parse('?from=2019-01-01&to=2019-02-01', bounds)
    expect(state.range).toEqual(defaultRange(bounds))
    expect(kinds(corrections)).toEqual(['rangeOutsideData'])
  })

  it('drops unknown ids and keeps the good ones', () => {
    const { state, corrections } = parse('?agents=agent_06,agent_99,nonsense', bounds)
    expect(state.agents).toEqual([MAJED])
    expect(kinds(corrections)).toEqual(['unknownId', 'unknownId'])
    expect(corrections[0]).toMatchObject({ param: 'agents', value: 'agent_99' })
  })

  it('removes duplicates', () => {
    const { state, corrections } = parse('?intents=roaming,roaming,roaming', bounds)
    expect(state.intents).toEqual([ROAMING])
    expect(kinds(corrections)).toEqual(['duplicateId', 'duplicateId'])
  })

  it('treats an empty list as no filter, with nothing to report', () => {
    const { state, corrections } = parse('?agents=&intents=&language=', bounds)
    expect(state.agents).toEqual([])
    expect(state.intents).toEqual([])
    expect(state.languages).toEqual([])
    expect(corrections).toEqual([])
  })

  it('ignores stray commas and whitespace', () => {
    const { state, corrections } = parse('?agents=,agent_06,,%20agent_01%20,', bounds)
    expect(state.agents).toEqual([codeFor('agents', 'agent_01')!, MAJED])
    expect(corrections).toEqual([])
  })

  it('reads compare, and reports a value it does not understand', () => {
    expect(parse('?compare=0', bounds).state.compare).toBe(false)
    expect(parse('?compare=1', bounds).state.compare).toBe(true)
    expect(parse('', bounds).state.compare).toBe(true)

    const { state, corrections } = parse('?compare=maybe', bounds)
    expect(state.compare).toBe(true)
    expect(kinds(corrections)).toEqual(['invalidCompare'])
  })

  it('survives outright garbage and still produces a usable state', () => {
    const { state, corrections } = parse(
      '?from=2026-13-45&to=&agents=%%%&intents=roaming,roaming&language=klingon&compare=yes&junk=1',
      bounds,
    )
    // Everything still has a sane value...
    expect(state.range).toEqual(defaultRange(bounds))
    expect(state.agents).toEqual([])
    expect(state.intents).toEqual([ROAMING])
    expect(state.languages).toEqual([])
    expect(state.compare).toBe(true)
    // ...and the user can be told something was wrong.
    expect(corrections.length).toBeGreaterThan(0)
    expect(kinds(corrections)).toContain('invalidDate')
    expect(kinds(corrections)).toContain('unknownId')
    expect(kinds(corrections)).toContain('duplicateId')
    expect(kinds(corrections)).toContain('invalidCompare')
  })

  it('always returns codes that index the dictionaries', () => {
    const { state } = parse(
      '?agents=agent_01,agent_08&intents=roaming&language=ar,en,mixed',
      bounds,
    )
    for (const code of state.agents) expect(AGENTS[code]).toBeDefined()
    for (const code of state.intents) expect(INTENTS[code]).toBeDefined()
    for (const code of state.languages) expect(LANGUAGES[code]).toBeDefined()
  })
})

describe('the shareable link in the brief', () => {
  it('describes Majed, roaming, Arabic, last week', () => {
    const state: FilterState = {
      range: defaultRange(bounds),
      agents: [MAJED],
      intents: [ROAMING],
      languages: [ARABIC],
      compare: true,
    }
    // Last week is the default range, so the dates are implied rather than
    // spelled out — but they are still explicit the moment anything moves.
    expect(serialize(state, bounds)).toBe('?agents=agent_06&intents=roaming&language=ar')
    expect(parse(serialize(state, bounds), bounds).state).toEqual(state)
  })
})

describe('withFilterParams', () => {
  /*
   * `serialize` deliberately builds the filter parameters from nothing, so
   * two people who built the same filters by different routes get the same
   * link. The query string also carries parameters this module does not own —
   * the drill-down, and which synthetic quarter is on screen — and rebuilding
   * from scratch used to drop them, so changing one filter closed an open
   * drill and threw the reader back to the default data.
   */
  it('keeps parameters the filters do not own', () => {
    const merged = withFilterParams('?seed=42&drill=all&from=2020-01-01', '?from=2026-09-20')

    expect(merged).toContain('seed=42')
    expect(merged).toContain('drill=all')
    // The filter value wins: it is the one being set.
    expect(merged).toContain('from=2026-09-20')
    expect(merged).not.toContain('2020-01-01')
  })

  it('drops a filter the new state no longer sets', () => {
    // Clearing the agents filter must actually clear it, not inherit the old
    // value back out of the existing URL.
    const merged = withFilterParams('?agents=agent_06&seed=42', '')

    expect(merged).not.toContain('agents')
    expect(merged).toContain('seed=42')
  })

  it('puts the filters first and keeps foreign parameters in order', () => {
    expect(withFilterParams('?seed=42&drill=all', '?from=2026-09-20&to=2026-09-26')).toBe(
      '?from=2026-09-20&to=2026-09-26&seed=42&drill=all',
    )
  })

  it('returns an empty string rather than a bare question mark', () => {
    expect(withFilterParams('', '')).toBe('')
  })
})
